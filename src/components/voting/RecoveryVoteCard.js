'use client';
import { useState, useEffect, useRef } from 'react';
import { Vote, Clock, CheckCircle2, Crown, ShieldAlert, Award, UserCheck, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  createRecoveryVote,
  castRecoveryVote,
  listenToRecoveryVote,
  finalizeRecoveryVote,
  applyWinningPlan,
} from '@/lib/firebase/firestore';
import { useToast } from '@/context/ToastContext';
import styles from './RecoveryVoteCard.module.css';

export default function RecoveryVoteCard({
  tripId,
  disruptionId,
  plans = [],
  totalMembers = 1,
  isOwner = false,
  userId = '',
  userName = 'Traveler',
  onApplyPlan,
}) {
  const toast = useToast();
  const [voteDoc, setVoteDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [votingIndex, setVotingIndex] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const autoExpiredRef = useRef(false);

  // 1. Initialize or load voting session
  useEffect(() => {
    if (!tripId || plans.length === 0) return;

    let unsub = null;
    async function initVoteSession() {
      try {
        setLoading(true);
        // Create initial vote session if none provided
        const initial = await createRecoveryVote(tripId, disruptionId, plans, totalMembers);
        setVoteDoc(initial);

        // Subscribe to real-time updates
        unsub = listenToRecoveryVote(tripId, initial.id, (updated) => {
          if (updated) {
            setVoteDoc(updated);
          }
        });
      } catch (err) {
        console.warn('Init vote session error:', err.message);
      } finally {
        setLoading(false);
      }
    }

    initVoteSession();
    return () => { if (unsub) unsub(); };
  }, [tripId, disruptionId]);

  // 2. Countdown Timer & Auto-Resolution on Expiration
  useEffect(() => {
    if (!voteDoc || voteDoc.resolutionStatus !== 'open') return;

    const expiryTs = voteDoc.expires_at ? new Date(voteDoc.expires_at).getTime() : Date.now() + 300000;
    const interval = setInterval(async () => {
      const remaining = Math.max(0, Math.floor((expiryTs - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0 && !autoExpiredRef.current && voteDoc.resolutionStatus === 'open') {
        autoExpiredRef.current = true;
        clearInterval(interval);
        toast.info('⏳ Voting countdown expired! Auto-applying Recommended Plan B.');

        const recIndex = plans.findIndex(p => p.is_recommended) !== -1 ? plans.findIndex(p => p.is_recommended) : 1;
        try {
          await finalizeRecoveryVote(tripId, voteDoc.id, recIndex, 'expired');
          if (onApplyPlan) {
            await onApplyPlan(plans[recIndex]);
          }
        } catch (_) {}
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [voteDoc]);

  // 3. Handle Auto-Applying Plan when consensus is reached
  useEffect(() => {
    if (!voteDoc || voteDoc.winningPlanIndex === null || voteDoc.winningPlanIndex === undefined) return;
    if (['majority', 'unanimous', 'owner_override'].includes(voteDoc.resolutionStatus)) {
      const winningPlan = plans[voteDoc.winningPlanIndex] || plans[0];
      if (winningPlan && onApplyPlan) {
        onApplyPlan(winningPlan);
      }
    }
  }, [voteDoc?.winningPlanIndex, voteDoc?.resolutionStatus]);

  // Handle member casting a vote
  const handleVote = async (planIdx) => {
    if (!voteDoc || voteDoc.resolutionStatus !== 'open' || !userId) return;

    try {
      setVotingIndex(planIdx);
      const res = await castRecoveryVote(tripId, voteDoc.id, userId, userName, planIdx);
      setVoteDoc(res);
      toast.success(`Vote recorded for ${plans[planIdx]?.plan_label || 'Plan'}!`);
    } catch (err) {
      toast.error('Failed to cast vote: ' + err.message);
    } finally {
      setVotingIndex(null);
    }
  };

  // Handle Owner Override
  const handleOwnerOverride = async (planIdx) => {
    if (!isOwner || !voteDoc) return;
    try {
      await finalizeRecoveryVote(tripId, voteDoc.id, planIdx, 'owner_override');
      toast.success(`👑 Owner override applied for ${plans[planIdx]?.plan_label}!`);
      if (onApplyPlan && plans[planIdx]) {
        await onApplyPlan(plans[planIdx]);
      }
    } catch (err) {
      toast.error('Failed to finalize plan: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className={styles.voteContainer} style={{ textAlign: 'center', padding: '24px' }}>
        <Clock className="animate-spin" size={24} color="var(--accent)" />
        <p style={{ marginTop: 8, fontSize: '0.8125rem', color: '#64748B' }}>
          Initializing Real-Time Group Voting Consensus...
        </p>
      </div>
    );
  }

  const votesMap = voteDoc?.votes || {};
  const currentVotesCount = Object.keys(votesMap).length;
  const userCurrentVote = votesMap[userId];
  const isResolved = voteDoc?.resolutionStatus && voteDoc.resolutionStatus !== 'open';
  const winningIdx = voteDoc?.winningPlanIndex;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = String(timeLeft % 60).padStart(2, '0');

  return (
    <div className={styles.voteContainer}>
      <div className={styles.voteHeader}>
        <div className={styles.titleBox}>
          <Vote size={22} color="var(--accent)" />
          <div>
            <h4 className={styles.title}>Group Voting Consensus</h4>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
              {currentVotesCount} of {totalMembers} members voted
            </span>
          </div>
        </div>

        {!isResolved && (
          <div className={styles.timerBadge}>
            <Clock size={15} />
            <span>Expires in {minutes}:{seconds}</span>
          </div>
        )}

        {isResolved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '4px 12px', borderRadius: 9999 }}>
            <CheckCircle2 size={16} />
            <span>
              {voteDoc.resolutionStatus === 'unanimous' && '🏆 Unanimous Agreement'}
              {voteDoc.resolutionStatus === 'majority' && '✅ Majority Consensus'}
              {voteDoc.resolutionStatus === 'owner_override' && '👑 Owner Override'}
              {voteDoc.resolutionStatus === 'expired' && '⏳ Auto-Applied Plan B'}
            </span>
          </div>
        )}
      </div>

      <div className={styles.plansGrid}>
        {plans.map((plan, idx) => {
          const isRec = plan.is_recommended;
          const isWinner = isResolved && winningIdx === idx;
          const isUserVoted = userCurrentVote === idx;

          // Count votes for this plan
          const planVotesCount = Object.values(votesMap).filter(v => v === idx).length;

          let cardClass = styles.planCard;
          if (isRec) cardClass += ` ${styles.recommendedCard}`;
          if (isWinner || isUserVoted) cardClass += ` ${styles.selectedCard}`;

          return (
            <div key={idx} className={cardClass}>
              {isRec && <span className={styles.recBadge}>Recommended</span>}

              <div className={styles.planHeader}>
                <span className={styles.planLabel}>{plan.plan_label}</span>
                <span className={styles.scoreBadge}>Score: {plan.convenience_score || 85}%</span>
              </div>

              <p className={styles.summary}>{plan.summary}</p>

              <div className={styles.metaRow}>
                <span>Cost: <strong>{plan.additional_cost > 0 ? `+${formatCurrency(plan.additional_cost)}` : 'Free / Included'}</strong></span>
                <span>Delay: <strong>+{plan.time_impact_minutes || 180}m</strong></span>
              </div>

              <div className={styles.voteActions}>
                <button
                  type="button"
                  disabled={isResolved || votingIndex !== null}
                  onClick={() => handleVote(idx)}
                  className={`${styles.voteBtn} ${isUserVoted ? styles.votedBtn : ''}`}
                >
                  <UserCheck size={14} />
                  <span>
                    {isUserVoted ? 'Voted' : 'Vote'} ({planVotesCount})
                  </span>
                </button>

                {isOwner && !isResolved && (
                  <button
                    type="button"
                    onClick={() => handleOwnerOverride(idx)}
                    className={styles.overrideBtn}
                    title="Override group vote as trip owner"
                  >
                    <Crown size={12} style={{ display: 'inline', marginRight: 3 }} />
                    Finalize
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Realtime Status Footbar */}
      <div className={`${styles.statusBanner} ${isResolved ? styles.statusResolved : styles.statusOpen}`}>
        <span>
          {!isResolved
            ? `⚡ Live real-time sync active — votes update instantly across all member screens.`
            : `Plan ${plans[winningIdx]?.plan_label || ''} has been approved and applied to your trip itinerary.`}
        </span>
      </div>
    </div>
  );
}
