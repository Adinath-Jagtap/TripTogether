'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  Zap, AlertTriangle, Shield, Check, X, Clock, DollarSign,
  ArrowRight, Star, ExternalLink, Phone, PhoneCall, Bot, Hotel, Sparkles, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { detectCascade } from '@/lib/algorithms/cascadeDetector';
import { evaluateTDREligibility, getTDRUrgencyStyle } from '@/lib/algorithms/tdrAgent';
import { generateEntryHash } from '@/lib/algorithms/hashChain';
import { formatCurrency, minutesToHours, getResilienceColor, BOOKING_TYPES } from '@/lib/utils';
import {
  getBookings, getBookingDependencies, getDisruptions,
  addDisruption, updateDisruption, updateBooking, addLedgerEntry,
  getLedgerEntries, addBooking,
} from '@/lib/firebase/firestore';
import { createNotification } from '@/lib/firebase/notifications';
import EntitlementChecker from '@/components/itinerary/EntitlementChecker';
import RecoveryVoteCard from '@/components/voting/RecoveryVoteCard';
import styles from './page.module.css';

export default function DisruptionPage() {
  const { trip, fetchTrip } = useTrip();
  const { id } = useParams();
  const toast = useToast();
  const { user } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [disruptions, setDisruptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [simBooking, setSimBooking] = useState('');
  const [simType, setSimType] = useState('delay');
  const [simDelay, setSimDelay] = useState(180);
  const [simDesc, setSimDesc] = useState('');

  const [activeDisruption, setActiveDisruption] = useState(null);
  const [cascadeResult, setCascadeResult] = useState([]);
  const [showCascade, setShowCascade] = useState(false);
  const [recoveryPlans, setRecoveryPlans] = useState([]);
  const [generatingPlans, setGeneratingPlans] = useState(false);
  const [reviewPlan, setReviewPlan] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null); // Phase 4: AI call in progress
  const [callOutcome, setCallOutcome] = useState(null);
  const [tdrAlerts, setTdrAlerts] = useState([]);
  const [dismissedTdrs, setDismissedTdrs] = useState(new Set());
  const [enrichedPhones, setEnrichedPhones] = useState({});

  const fetchVendorPhones = async (disruptedBooking, cascadeList) => {
    const allTargets = [disruptedBooking, ...(cascadeList || []).map(c => c.booking)].filter(Boolean);
    const initialMap = { ...enrichedPhones };
    allTargets.forEach(b => {
      initialMap[b.id] = { loading: true, phone: b.contact_phone || null };
    });
    setEnrichedPhones(initialMap);

    for (const b of allTargets) {
      if (b.contact_phone) {
        setEnrichedPhones(prev => ({ ...prev, [b.id]: { loading: false, phone: b.contact_phone } }));
        continue;
      }
      try {
        const res = await fetch('/api/places/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: b.title || b.vendor || 'Hotel', city: trip?.destination || '' }),
        });
        const data = await res.json();
        if (data.vendor_phone) {
          setEnrichedPhones(prev => ({
            ...prev,
            [b.id]: { loading: false, phone: data.vendor_phone, address: data.vendor_address }
          }));
        } else {
          setEnrichedPhones(prev => ({ ...prev, [b.id]: { loading: false, phone: null } }));
        }
      } catch (_) {
        setEnrichedPhones(prev => ({ ...prev, [b.id]: { loading: false, phone: null } }));
      }
    }
  };

  const load = async () => {
    try {
      const b = await getBookings(id);
      setBookings(b || []);
      const d = await getBookingDependencies(id);
      setDependencies(d || []);
      const dis = await getDisruptions(id);
      setDisruptions(dis || []);

      // Fetch active TDR alerts from ledger
      try {
        const ledger = await getLedgerEntries(id);
        const tdrEntries = ledger.filter(e => e.event_type === 'tdr_alert');
        const alertMap = new Map();
        const sixtyMinAgo = Date.now() - 60 * 60 * 1000;
        for (const entry of tdrEntries) {
          const ts = entry.created_at?.toMillis?.() || entry.created_at?.seconds * 1000 || new Date(entry.created_at).getTime() || 0;
          if (ts > sixtyMinAgo) {
            const existing = alertMap.get(entry.booking_id);
            if (!existing || ts > (existing.ts || 0)) {
              alertMap.set(entry.booking_id, { ...entry, ts });
            }
          }
        }
        setTdrAlerts(Array.from(alertMap.values()));
      } catch (_) {}
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Phase 4: Initiate an AI VoIP call to the hotel
  const initiateAICall = async (ch) => {
    setReviewPlan(null);
    setCallOutcome(null);
    try {
      const booking = bookings.find(b => b.id === ch.booking_id);
      const res = await fetch('/api/ai/call-initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: id,
          bookingId: ch.booking_id,
          hotelName: booking?.vendor || booking?.title || 'Hotel',
          hotelPhone: ch.contact_phone || booking?.contact_phone,
          guestName: trip?.owner_name || 'Guest',
          bookingRef: booking?.confirmation_number || booking?.pnr || 'N/A',
          changeRequest: ch.change_reason || 'Reschedule required due to travel delay',
          originalTime: ch.original_start ? new Date(ch.original_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          newTime: ch.new_start ? new Date(ch.new_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          reason: activeDisruption?.description || 'Flight delay',
        }),
      });
      const data = await res.json();

      // Handle hotel not registered
      if (data.notRegistered) {
        toast.error('Hotel phone not registered for AI calls. Please call manually.');
        return;
      }
      if (data.error && !data.callId) {
        toast.error(data.error || 'Failed to initiate call');
        return;
      }

      if (data.callId) {
        setActiveCallId(data.callId);
        const { onSnapshot, doc: fsDoc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');

        // Request browser Notification permission once, non-blocking
        if (typeof window !== 'undefined' && 'Notification' in window) {
          Notification.requestPermission().catch(() => {});
        }

        // Capture booking info NOW (ch is valid here; bookings state is current here)
        // — do NOT read these inside the async callbacks/timeout where they may be stale
        const callBooking  = bookings.find(b => b.id === ch?.booking_id);
        const callHotelPhone = ch?.contact_phone || callBooking?.contact_phone || '';
        const callHotelName  = callBooking?.vendor || callBooking?.title || ch?.hotelName || 'the hotel';
        const callNewTime    = ch?.new_start
          ? new Date(ch.new_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : null;
        // Only notify the current user (members require Cloud Functions for cross-uid writes)
        const notifyUid = user?.uid;

        // 90-second timeout — if hotel doesn't answer, auto-complete
        const timeoutId = setTimeout(async () => {
          try {
            await updateDoc(fsDoc(db, 'calls', data.callId), {
              status: 'completed',
              outcome: 'no_answer',
              ended_at: new Date(),
            });
          } catch (_) {}
          setActiveCallId(null);
          toast.warning('Hotel did not answer within 90 seconds. Please call manually.');

          if (notifyUid) {
            console.log(`[disruption] Creating no_answer notification for uid=${notifyUid}`);
            await createNotification(notifyUid, {
              tripId: id,
              callId: data.callId,
              type: 'call_outcome',
              action: 'call_hotel',
              hotelPhone: callHotelPhone,
              hotelName: callHotelName,
              title: `Action needed: call ${callHotelName} directly`,
              body: `The AI couldn't reach ${callHotelName} — please call ${callHotelPhone || 'the hotel'} directly to confirm your new check-in time.`,
            });
          }
          _fireNativeNotification(
            `Action needed: call ${callHotelName}`,
            `The AI couldn't reach ${callHotelName}. Please call ${callHotelPhone || 'the hotel'} directly.`,
            callHotelPhone
          );
        }, 90000);


        const unsub = onSnapshot(fsDoc(db, 'calls', data.callId), async (snap) => {
          const d = snap.data();
          if (d?.status === 'completed') {
            clearTimeout(timeoutId);
            setCallOutcome(d.outcome);
            setActiveCallId(null);
            unsub();

            if (d.outcome === 'confirmed') {
              toast.success('Hotel confirmed the change!');
              if (notifyUid) {
                await createNotification(notifyUid, {
                  tripId: id,
                  callId: data.callId,
                  type: 'call_outcome',
                  hotelName: callHotelName,
                  title: 'Hotel confirmed your new check-in time',
                  body: `Your check-in at ${callHotelName} has been rescheduled to ${callNewTime || 'the new time'}.`,
                });
              }
            } else if (d.manual_reason === 'financial_terms') {
              toast.warning(`Action needed: ${callHotelName} mentioned extra charges.`);
              if (notifyUid) {
                await createNotification(notifyUid, {
                  tripId: id,
                  callId: data.callId,
                  type: 'call_outcome',
                  action: 'call_hotel',
                  hotelPhone: callHotelPhone,
                  hotelName: callHotelName,
                  title: `Action needed: call ${callHotelName} about payment`,
                  body: `${callHotelName} mentioned an additional charge for your delayed check-in. The AI can't confirm payment terms — please call ${callHotelPhone || 'the hotel'} directly to finish this.`,
                });
              }
              _fireNativeNotification(
                `Call ${callHotelName} about payment`,
                `${callHotelName} mentioned an extra charge. Please call ${callHotelPhone || 'the hotel'} directly.`,
                callHotelPhone
              );
            } else if (d.outcome === 'rejected') {
              toast.error('Hotel declined the call.');
              if (notifyUid) {
                await createNotification(notifyUid, {
                  tripId: id,
                  callId: data.callId,
                  type: 'call_outcome',
                  action: 'call_hotel',
                  hotelPhone: callHotelPhone,
                  hotelName: callHotelName,
                  title: `Action needed: call ${callHotelName} directly`,
                  body: `The hotel declined the AI call. Please call ${callHotelPhone || callHotelName} directly to resolve your check-in time.`,
                });
              }
            } else {
              toast.warning('Hotel needs manual follow-up.');
              if (notifyUid) {
                await createNotification(notifyUid, {
                  tripId: id,
                  callId: data.callId,
                  type: 'call_outcome',
                  action: 'call_hotel',
                  hotelPhone: callHotelPhone,
                  hotelName: callHotelName,
                  title: `Action needed: call ${callHotelName} directly`,
                  body: `Please call ${callHotelPhone || callHotelName} directly to confirm your updated check-in time.`,
                });
              }
            }
          }
        });
      }
    } catch (err) {
      toast.error('Failed to initiate AI call. Please call manually.');
    }
  };

  const triggerDisruption = async () => {
    if (!simBooking) { toast.error('Select a booking to disrupt'); return; }
    const booking = bookings.find(b => b.id === simBooking);
    if (!booking) return;

    const affected = detectCascade(simBooking, dependencies, bookings, simType === 'delay' ? simDelay : 999);

    let disruption = null;
    try {
      disruption = await addDisruption(id, {
        trip_id: id,
        booking_id: simBooking,
        type: simType,
        severity: affected.length > 2 ? 'critical' : affected.length > 0 ? 'high' : 'medium',
        description: simDesc || `${simType === 'delay' ? `${simDelay} minute delay` : 'Cancellation'} on ${booking.title}`,
        delay_minutes: simType === 'delay' ? simDelay : null,
        is_simulated: true,
        affected_booking_ids: affected.map(a => a.booking_id),
        status: 'active',
      });
    } catch (_) {}

    // TDR Autopilot evaluation for train delays >= 180 minutes (3 hours)
    // For simulation: we log the TDR alert directly since the evaluator's
    // strict departure-time check would fail for past or demo bookings.
    if (booking.type === 'train' && simType === 'delay' && simDelay >= 180) {
      const pnr = booking.pnr || booking.confirmation_number || '2847193021';
      const refundAmount = Number(booking.cost) || 1850;
      // Compute a reasonable "minutes remaining" for simulation display
      const depMs = new Date(booking.start_datetime).getTime();
      const simMinutesRemaining = isNaN(depMs) ? 120 : Math.max(15, Math.round((depMs - Date.now()) / 60000) + simDelay);
      try {
        const entryData = {
          event_type: 'tdr_alert',
          description: `TDR Alert: ${booking.title} delayed ${simDelay}m. TDR refund window open — file before departure.`,
          amount: refundAmount,
          booking_id: booking.id,
          sequence_number: Date.now(),
          details: {
            pnr,
            delayMinutes: simDelay,
            minutesRemaining: simMinutesRemaining,
            eligibleRefund: refundAmount,
            channel: simMinutesRemaining < 15 ? 'call' : simMinutesRemaining < 60 ? 'sms' : 'push',
          },
          created_at: new Date().toISOString(),
        };
        const entryHash = await generateEntryHash(entryData, null);
        await addLedgerEntry(id, { ...entryData, entry_hash: entryHash });
        toast.success('🚨 TDR Autopilot: Train delay >3h detected! TDR Refund claim window is now open.');
      } catch (err) {
        console.error('TDR Ledger logging error:', err);
      }
    }

    // Update booking statuses
    try { await updateBooking(id, simBooking, { status: 'disrupted', risk_level: 'high' }); } catch (_) {}
    for (const a of affected) {
      try {
        await updateBooking(id, a.booking_id, {
          status: a.impact_type === 'missed' ? 'disrupted' : 'at_risk',
          risk_level: a.impact_type === 'missed' ? 'high' : 'medium',
          risk_reason: a.impact_description,
        });
      } catch (_) {}
    }

    setActiveDisruption({ ...disruption, booking });
    setCascadeResult(affected);
    setShowCascade(true);
    fetchVendorPhones(booking, affected);
    toast.warning('Disruption triggered! Analyzing cascade impact...');

    setGeneratingPlans(true);
    try {
      const res = await fetch('/api/ai/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: id,
          disruptionId: disruption?.id,
          disruption: { type: simType, booking, delay_minutes: simDelay, description: simDesc },
          allBookings: bookings,
          dependencies,
          affectedBookings: affected,
          members: [],
          budget: trip?.budget || 0,
        }),
      });
      const data = await res.json();
      setRecoveryPlans(data.plans || []);
    } catch (_) {
      setRecoveryPlans([
        { plan_label: 'Plan A', summary: 'Cancel affected bookings and get refunds. Minimal cost but lose activities.', is_recommended: false, additional_cost: 0, refund_amount: 0, time_impact_minutes: 0, convenience_score: 30, bookings_affected: affected.length, changes: [] },
        { plan_label: 'Plan B', summary: 'Reschedule affected bookings to later times. Some additional cost but preserves the experience.', is_recommended: true, additional_cost: 2000, refund_amount: 0, time_impact_minutes: simDelay, convenience_score: 70, bookings_affected: affected.length, changes: [] },
        { plan_label: 'Plan C', summary: 'Replace with premium alternatives for maximum convenience. Higher cost but best experience.', is_recommended: false, additional_cost: 5000, refund_amount: 0, time_impact_minutes: 30, convenience_score: 95, bookings_affected: affected.length, changes: [] },
      ]);
    }
    setGeneratingPlans(false);
    load();
  };

  const acceptPlan = async (plan) => {
    try {
      if (activeDisruption?.id) {
        try {
          await updateDisruption(id, activeDisruption.id, {
            status: 'resolved',
            description: `${activeDisruption.description || 'Disruption'} (Resolved via ${plan.plan_label})`
          });
        } catch (_) {}
      }

      let changes = plan.changes && plan.changes.length > 0 ? plan.changes : [];
      if (changes.length === 0) {
        const delay = Number(activeDisruption?.delay_minutes) || 120;
        const targets = [];
        if (activeDisruption?.booking_id) {
          const b = bookings.find(x => x.id === activeDisruption.booking_id);
          if (b) targets.push(b);
        }
        for (const a of cascadeResult) {
          const b = bookings.find(x => x.id === a.booking_id);
          if (b && !targets.some(t => t.id === b.id)) targets.push(b);
        }
        changes = targets.map(b => {
          const shiftDate = (iso, mins) => {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            d.setMinutes(d.getMinutes() + mins);
            return d.toISOString().slice(0, 19);
          };
          return {
            booking_id: b.id,
            action: 'reschedule',
            original_title: b.title,
            new_title: `${b.title} (Rescheduled +${delay}m)`,
            original_start: b.start_datetime,
            new_start: shiftDate(b.start_datetime, delay),
            original_end: b.end_datetime,
            new_end: shiftDate(b.end_datetime, delay),
            change_reason: `${activeDisruption?.type || 'Disruption'}: Times shifted to absorb delay.`
          };
        });
      }

      const appliedList = [];
      for (const ch of changes) {
        if (!ch.booking_id) continue;
        const currentBooking = bookings.find(b => b.id === ch.booking_id);
        const metadata = {
          is_recovered: true, plan_label: plan.plan_label, disruption_type: activeDisruption?.type || 'Disruption',
          original_title: ch.original_title || currentBooking?.title, new_title: ch.new_title,
          original_start: ch.original_start || currentBooking?.start_datetime, new_start: ch.new_start,
          original_end: ch.original_end || currentBooking?.end_datetime, new_end: ch.new_end,
          change_reason: ch.change_reason || plan.summary, applied_at: new Date().toISOString(),
        };
        const recoveryTag = `[RECOVERED_PLAN]:${JSON.stringify(metadata)}`;
        const newStatus = ch.action === 'cancel' ? 'cancelled' : 'rescheduled';
        try {
          await updateBooking(id, ch.booking_id, {
            title: ch.new_title, start_datetime: ch.new_start, end_datetime: ch.new_end,
            status: newStatus, risk_level: 'low', risk_reason: recoveryTag,
          });
        } catch (_) {}
        appliedList.push({ booking_id: ch.booking_id, ...metadata });
      }

      if (typeof window !== 'undefined') {
        const stored = JSON.parse(localStorage.getItem(`trip_recoveries_${id}`) || '[]');
        stored.unshift({ plan_label: plan.plan_label, summary: plan.summary, applied_at: new Date().toISOString(), changes: appliedList });
        localStorage.setItem(`trip_recoveries_${id}`, JSON.stringify(stored));
      }

      try {
        await addLedgerEntry(id, {
          event_type: 'disruption_recovery',
          description: `${plan.plan_label} applied: ${appliedList.length} segments adjusted.`,
          amount: plan.additional_cost || 0,
          sequence_number: Date.now(),
        });
      } catch (_) {}

      setActiveDisruption(null);
      setCascadeResult([]);
      setShowCascade(false);
      setRecoveryPlans([]);
      toast.success(`${plan.plan_label} applied! Your itinerary has been updated.`);
      load();
      fetchTrip();
    } catch (err) {
      console.error('Accept recovery plan error:', err);
      toast.error('Failed to apply recovery plan');
    }
  };

  const score = trip?.resilience_score || 85;
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />;

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Disruption Center</h2>

      {/* ── TDR AUTOPILOT FILING ALERT CARDS ── */}
      {tdrAlerts
        .filter(alert => !dismissedTdrs.has(alert.booking_id))
        .map(alert => {
          const booking = bookings.find(b => b.id === alert.booking_id);
          const refundAmount = alert.details?.eligibleRefund || alert.amount || booking?.cost || 1850;
          const minutesRemaining = alert.details?.minutesRemaining || 120;
          const pnr = alert.details?.pnr || booking?.pnr || booking?.confirmation_number || '2847193021';
          const urgency = getTDRUrgencyStyle(minutesRemaining);

          const handleClaimRefund = async () => {
            if (pnr) {
              try {
                await navigator.clipboard.writeText(pnr);
                toast.success(`PNR (${pnr}) copied! Opening IRCTC TDR filing page...`);
              } catch (_) {
                toast.info(`PNR: ${pnr}`);
              }
            }
            window.open('https://www.irctc.co.in/nget/train-search', '_blank', 'noopener,noreferrer');
          };

          return (
            <div key={alert.booking_id} style={{
              background: urgency.bg,
              border: `1.5px solid ${urgency.border}`,
              borderLeft: `5px solid ${urgency.color}`,
              borderRadius: 14,
              padding: '16px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              position: 'relative',
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>🚂</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: urgency.color, background: urgency.border, padding: '2px 8px', borderRadius: 8, letterSpacing: '0.03em' }}>
                    {urgency.label} — TDR REFUND ELIGIBLE
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: urgency.color }}>
                    Filing Window Closes in {minutesRemaining} min
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#1F2937', lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>{booking?.title || 'Train Booking'}</strong> is delayed by <strong>{alert.details?.delayMinutes || '180+'} minutes</strong> (&gt;3 hours).
                  Per Indian Railways TDR rules, you are eligible for a <strong>{formatCurrency(refundAmount, trip?.currency)}</strong> 100% full refund if filed BEFORE actual departure!
                  {pnr && <span style={{ marginLeft: 8, fontFamily: 'monospace', background: '#E5E7EB', padding: '2px 8px', borderRadius: 4, fontSize: '0.8125rem', color: '#111827', fontWeight: 700 }}>PNR: {pnr}</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleClaimRefund}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: urgency.color, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', transition: 'opacity 0.15s' }}
                  >
                    <ExternalLink size={14} /> Claim Full Refund on IRCTC →
                  </button>
                  <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    Tap copies PNR to clipboard &amp; opens IRCTC TDR form
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissedTdrs(prev => new Set([...prev, alert.booking_id]))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: urgency.color, opacity: 0.6, padding: 4, flexShrink: 0 }}
                aria-label="Dismiss TDR alert"
              >
                <X size={18} />
              </button>
            </div>
          );
        })
      }

      <div className={styles.riskOverview}>
        <div className={styles.scoreCard}>
          <div className={styles.scoreCircle} style={{ borderColor: getResilienceColor(score) }}>
            <span style={{ color: getResilienceColor(score) }}>{score}</span>
          </div>
          <div>
            <div className={styles.scoreLabel}>Trip Resilience</div>
            <div className={styles.scoreSub}>{bookings.filter(b => b.risk_level !== 'low').length} bookings at risk</div>
          </div>
        </div>
        <div className={styles.riskBar}>
          {bookings.map(b => (
            <div key={b.id} className={styles.riskSegment}
              style={{ flex: 1, background: b.risk_level === 'high' ? 'var(--danger)' : b.risk_level === 'medium' ? 'var(--warning)' : 'var(--success)' }}
              title={`${b.title}: ${b.risk_level} risk`}
            />
          ))}
        </div>
      </div>

      <div className={`card ${styles.simCard}`}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={18} style={{ color: 'var(--warning)' }} /> Simulate a Disruption
        </h3>
        <div className={styles.simForm}>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Booking</label>
            <select className="form-input form-select" value={simBooking} onChange={e => setSimBooking(e.target.value)}>
              <option value="">Select a booking...</option>
              {confirmedBookings.map(b => <option key={b.id} value={b.id}>{b.title} ({BOOKING_TYPES[b.type]?.label})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Type</label>
            <select className="form-input form-select" value={simType} onChange={e => setSimType(e.target.value)}>
              <option value="delay">Delay</option>
              <option value="cancellation">Cancellation</option>
              <option value="weather">Weather</option>
              <option value="venue_closed">Venue Closed</option>
            </select>
          </div>
          {simType === 'delay' && (
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Delay (min)</label>
              <input type="number" className="form-input" value={simDelay} onChange={e => setSimDelay(Number(e.target.value))} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn btn-danger" onClick={triggerDisruption}>
            <Zap size={16} /> Trigger Disruption
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ borderColor: '#FDE68A', background: '#FFFBEB', color: '#B45309', fontWeight: 600 }}
            onClick={async () => {
              let trainB = bookings.find(b => b.type === 'train');
              if (!trainB) {
                try {
                  toast.info('Adding mock train booking (Rajdhani Express)...');
                  trainB = await addBooking(id, {
                    type: 'train',
                    title: '12951 Rajdhani Express',
                    pnr: '2847193021',
                    train_number: '12951',
                    origin_location: 'New Delhi (NDLS)',
                    destination_location: 'Mumbai Central (MMCT)',
                    start_datetime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                    end_datetime: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString(),
                    cost: 1850,
                    status: 'confirmed',
                  });
                  const fresh = await getBookings(id);
                  setBookings(fresh);
                } catch (_) {}
              }
              if (trainB) {
                setSimBooking(trainB.id);
                setSimType('delay');
                setSimDelay(210);
                setSimDesc('Train delayed by 3.5 hours at origin due to signal failure.');
                toast.info('Preset selected: 210m delay on Rajdhani Express. Click "Trigger Disruption" to run!');
              }
            }}
          >
            🚂 Preset: 3.5h Train Delay (TDR Refund)
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showCascade && (
          <motion.div className={styles.cascadeSection} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /> Impact Cascade
            </h3>
            <motion.div className={`card card-flat ${styles.cascadeCard} ${styles.cascadeDisrupted}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <Zap size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{activeDisruption?.booking?.title}</strong>
                <div style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{simType === 'delay' ? `Delayed ${minutesToHours(simDelay)}` : 'Cancelled'}</div>
              </div>
              {(() => {
                const phoneInfo = enrichedPhones[activeDisruption?.booking?.id];
                if (phoneInfo?.loading) {
                  return (
                    <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600 }}>
                      <span className="animate-pulse">📞 Finding phone...</span>
                    </span>
                  );
                }
                if (phoneInfo?.phone) {
                  return (
                    <a
                      href={`tel:${phoneInfo.phone}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 9999,
                        background: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        color: '#15803D',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        textDecoration: 'none',
                        marginLeft: 'auto',
                      }}
                      title={`Call ${activeDisruption?.booking?.title} vendor directly`}
                      onClick={e => e.stopPropagation()}
                    >
                      📞 {phoneInfo.phone}
                    </a>
                  );
                }
                return null;
              })()}
            </motion.div>
            {cascadeResult.map((a, i) => (
              <motion.div key={a.booking_id} className={`card card-flat ${styles.cascadeCard} ${styles[`cascade_${a.impact_type}`]}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.25 }}>
                <ArrowRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{a.booking?.title}</strong>
                  <div style={{ fontSize: '0.8125rem', color: a.impact_type === 'missed' ? 'var(--danger)' : 'var(--warning)' }}>{a.impact_description}</div>
                </div>
                <span className={`badge ${a.impact_type === 'missed' ? 'badge-danger' : 'badge-warning'}`}>{a.impact_type}</span>
                {(() => {
                  const phoneInfo = enrichedPhones[a.booking_id];
                  if (phoneInfo?.loading) {
                    return (
                      <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, marginLeft: 8 }}>
                        <span className="animate-pulse">📞 Finding phone...</span>
                      </span>
                    );
                  }
                  if (phoneInfo?.phone) {
                    return (
                      <a
                        href={`tel:${phoneInfo.phone}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          borderRadius: 9999,
                          background: '#F0FDF4',
                          border: '1.5px solid #86EFAC',
                          color: '#15803D',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          textDecoration: 'none',
                          marginLeft: 8,
                        }}
                        title={`Call ${a.booking?.title} vendor directly`}
                        onClick={e => e.stopPropagation()}
                      >
                        📞 {phoneInfo.phone}
                      </a>
                    );
                  }
                  return null;
                })()}
              </motion.div>
            ))}
            <div className={styles.impactSummary}>
              <span>{cascadeResult.length} bookings affected</span>
              <span>·</span>
              <span>{formatCurrency(cascadeResult.reduce((s, a) => s + (a.booking?.cost || 0), 0), trip?.currency)} at risk</span>
              <span>·</span>
              <span>{minutesToHours(cascadeResult.reduce((s, a) => s + a.accumulated_delay, 0))} total delay</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ENTITLEMENT CHECKER — appears after cascade, before recovery plans ── */}
      {showCascade && activeDisruption?.booking && (
        <EntitlementChecker
          booking={activeDisruption.booking}
          disruption={{
            type: simType,
            delay_minutes: simDelay,
            description: activeDisruption.description || '',
          }}
          currency={trip?.currency}
        />
      )}

      {(generatingPlans || recoveryPlans.length > 0) && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ marginBottom: 16 }}>Recovery Plans</h3>
          {generatingPlans ? (
            <div style={{ display: 'flex', gap: 16 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 220, borderRadius: 12 }} />)}
            </div>
          ) : (
            <div className={styles.plansGrid}>
              {recoveryPlans.map((plan, i) => (
                <motion.div key={i} className={`card ${styles.planCard} ${plan.is_recommended ? styles.recommended : ''}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                  <div className={styles.planHeader}>
                    <span className={styles.planLabel}>{plan.plan_label}</span>
                    {plan.is_recommended && <span className="badge badge-accent"><Star size={10} /> Recommended</span>}
                  </div>
                  <p className={styles.planSummary}>{plan.summary}</p>
                  <div className={styles.planMetrics}>
                    <div className={styles.planMetric}><DollarSign size={14} /><span>+{formatCurrency(plan.additional_cost, trip?.currency)}</span></div>
                    <div className={styles.planMetric}><Clock size={14} /><span>{minutesToHours(plan.time_impact_minutes)}</span></div>
                    <div className={styles.planMetric}><span>Convenience: {plan.convenience_score}/100</span></div>
                  </div>
                  <button className={`btn ${plan.is_recommended ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%', marginTop: 12 }} onClick={() => setReviewPlan(plan)}>
                    Review Changes
                  </button>
                </motion.div>
              ))}
            </div>
          )}

          {/* Real-Time Group Voting Consensus System */}
          {!generatingPlans && recoveryPlans.length > 0 && (
            <RecoveryVoteCard
              tripId={id}
              disruptionId={activeDisruption?.id}
              plans={recoveryPlans}
              totalMembers={trip?.member_ids?.length || 1}
              isOwner={user?.uid === trip?.owner_id}
              userId={user?.uid}
              userName={user?.displayName || user?.email?.split('@')[0] || 'Traveler'}
              onApplyPlan={(plan) => acceptPlan(plan)}
            />
          )}
        </div>
      )}

      {disruptions.filter(d => d.status === 'resolved').length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ marginBottom: 16 }}>Past Disruptions</h3>
          {disruptions.filter(d => d.status === 'resolved').map(d => (
            <div key={d.id} className="card card-flat" style={{ padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{d.description}</span>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>{d.type} · {d.affected_booking_ids?.length || 0} affected</div>
                </div>
                <span className="badge badge-success"><Check size={10} /> Resolved</span>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Review Changes Modal — Phase 3 */}
      {reviewPlan && (
        <div className="modal-overlay" onClick={() => setReviewPlan(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{reviewPlan.plan_label} — Review Changes</h3>
              <button className="modal-close" onClick={() => setReviewPlan(null)}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {(reviewPlan.changes || []).map((ch, i) => {
                const booking = bookings.find(b => b.id === ch.booking_id);
                const isCallVendor = ch.action === 'call_vendor';
                const isCancel = ch.action === 'cancel_and_refund';
                const isNoAction = ch.action === 'no_action';
                return (
                  <div key={i} style={{
                    padding: '16px',
                    borderRadius: '16px',
                    border: `1px solid ${isCallVendor ? '#FDE68A' : isCancel ? '#FECACA' : isNoAction ? 'var(--border-default)' : '#BBF7D0'}`,
                    background: isCallVendor ? 'var(--accent-subtle, #FFFBEB)' : isCancel ? '#FEF2F2' : isNoAction ? 'var(--bg-subtle, #F7F6F3)' : '#F0FDF4',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isCallVendor ? 10 : 0 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>{booking?.title || ch.original_title}</div>
                        <div style={{ fontSize: '0.8125rem', marginTop: 3, color: 'var(--text-secondary)' }}>
                          {isNoAction && '— No schedule change needed'}
                          {isCancel && '🗑️ Booking will be cancelled & refunded'}
                          {ch.action === 'auto_reschedule' && `✅ Auto-adjusted · ${ch.change_reason || ''}`}
                          {isCallVendor && `☎️ Requires vendor confirmation for reschedule`}
                        </div>
                      </div>
                    </div>
                    {isCallVendor && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        {ch.contact_phone && (
                          <a
                            href={`tel:${ch.contact_phone}`}
                            className="btn btn-secondary btn-sm"
                            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10 }}
                          >
                            <Phone size={13} /> Call Manually ({ch.contact_phone})
                          </a>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, background: 'var(--accent-gradient)' }}
                          onClick={() => initiateAICall(ch)}
                        >
                          <Bot size={14} /> Call via AI Agent
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Additional cost: <strong>{formatCurrency(reviewPlan.additional_cost, trip?.currency)}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setReviewPlan(null)}>← Back</button>
                <button className="btn btn-primary" onClick={() => { setReviewPlan(null); acceptPlan(reviewPlan); }}>
                  <Check size={16} /> Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Phase 4: Active AI Call Overlay */}
      {activeCallId && (
        <ActiveCallOverlay callId={activeCallId} onClose={() => setActiveCallId(null)} />
      )}
    </div>
  );
}

// Traveler-side live call view
function ActiveCallOverlay({ callId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [callData, setCallData] = useState(null);

  // Use dynamic import since this is a client component
  useEffect(() => {
    if (!callId) return;
    let unsubCall, unsubMsgs;
    import('firebase/firestore').then(({ onSnapshot, doc, collection, query, orderBy }) => {
      import('@/lib/firebase/config').then(({ db }) => {
        unsubCall = onSnapshot(doc(db, 'calls', callId), (snap) => {
          if (snap.exists()) setCallData(snap.data());
        });
        unsubMsgs = onSnapshot(
          query(collection(db, 'calls', callId, 'messages'), orderBy('timestamp', 'asc')),
          (snap) => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
      });
    });
    return () => { unsubCall?.(); unsubMsgs?.(); };
  }, [callId]);

  const isConnected = callData?.status === 'connected';
  const isCompleted = callData?.status === 'completed';
  const isRinging = !isConnected && !isCompleted;
  const isConfirmed = callData?.outcome === 'confirmed';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: 24,
        width: '100%',
        maxWidth: 520,
        height: '82vh',
        maxHeight: 680,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-default, #EBE9E5)',
          background: 'rgba(255, 255, 255, 0.95)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {isConnected ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#FEF2F2',
                  border: '1px solid #FEE2E2',
                  color: '#DC2626',
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  padding: '3px 8px',
                  borderRadius: 20,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', animation: 'pulse 1s infinite' }} />
                  LIVE NEGOTIATION
                </span>
              ) : isCompleted ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: isConfirmed ? '#ECFDF5' : '#FFFBEB',
                  border: `1px solid ${isConfirmed ? '#A7F3D0' : '#FDE68A'}`,
                  color: isConfirmed ? '#059669' : '#D97706',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 20,
                }}>
                  {isConfirmed ? '✅ CALL CONCLUDED' : '⚠️ CALL ENDED'}
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#FFFBEB',
                  border: '1px solid #FEF3C7',
                  color: '#D97706',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 20,
                }}>
                  <PhoneCall size={11} />
                  RINGING VENDOR...
                </span>
              )}
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)', letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hotel size={18} style={{ color: 'var(--accent, #D97706)' }} />
              {callData?.hotelName || 'Hotel Vendor'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #5C5C5C)', marginTop: 2 }}>
              Booking: <strong style={{ color: 'var(--text-primary, #1A1A1A)' }}>{callData?.bookingRef || 'HSP-2024'}</strong>
              {callData?.hotelPhone ? ` · ${callData.hotelPhone}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-subtle, #F7F6F3)',
              border: '1px solid var(--border-default, #EBE9E5)',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #5C5C5C)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Close Call Modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status Activity Ribbon */}
        <div style={{
          padding: '8px 16px',
          background: isConnected ? 'var(--accent-subtle, #FFFBEB)' : '#F9FAFB',
          borderBottom: '1px solid var(--border-default, #EBE9E5)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.75rem',
          color: isConnected ? 'var(--accent-dark, #92400E)' : 'var(--text-secondary, #5C5C5C)',
          fontWeight: 500,
        }}>
          {isConnected ? (
            <>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span>AI Travel Assistant is speaking with hotel reception to adjust check-in.</span>
            </>
          ) : isRinging ? (
            <>
              <PhoneCall size={14} style={{ color: 'var(--accent)' }} />
              <span>Contacting hotel switchboard... Waiting for staff to answer.</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} style={{ color: isConfirmed ? '#059669' : '#D97706' }} />
              <span>Call has finished and results are recorded below.</span>
            </>
          )}
        </div>

        {/* Live Conversation Transcript */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: '#FAFAF8',
        }}>
          {messages.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-tertiary, #9CA3AF)',
            }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'var(--accent-subtle, #FFFBEB)',
                border: '1px solid var(--accent-light, #FEF3C7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #D97706)',
                marginBottom: 12,
              }}>
                <PhoneCall size={24} />
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary, #1A1A1A)', fontSize: '0.9375rem', marginBottom: 4 }}>
                Connecting to Hotel...
              </div>
              <div style={{ fontSize: '0.8125rem' }}>
                TripTogether assistant will begin speaking as soon as reception picks up.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                maxWidth: '84%',
                alignSelf: msg.sender === 'ai' ? 'flex-start' : 'flex-end',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: 'var(--text-secondary, #5C5C5C)',
                marginBottom: 4,
                padding: '0 4px',
                justifyContent: msg.sender === 'ai' ? 'flex-start' : 'flex-end',
              }}>
                {msg.sender === 'ai' ? (
                  <>
                    <Bot size={12} style={{ color: 'var(--accent, #D97706)' }} />
                    <span>TripTogether AI</span>
                  </>
                ) : (
                  <>
                    <span>Hotel Reception</span>
                    <Hotel size={12} style={{ color: 'var(--text-secondary)' }} />
                  </>
                )}
              </div>

              <div style={{
                background: msg.sender === 'ai'
                  ? '#FFFFFF'
                  : 'var(--accent-gradient, linear-gradient(135deg, #F59E0B 0%, #D97706 100%))',
                color: msg.sender === 'ai' ? 'var(--text-primary, #1A1A1A)' : '#FFFFFF',
                border: msg.sender === 'ai' ? '1px solid var(--border-default, #EBE9E5)' : 'none',
                padding: '12px 16px',
                borderRadius: msg.sender === 'ai' ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
                fontSize: '0.875rem',
                lineHeight: 1.55,
                boxShadow: msg.sender === 'ai'
                  ? '0 1px 4px rgba(0, 0, 0, 0.03)'
                  : '0 4px 12px rgba(217, 119, 6, 0.2)',
              }}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Outcome Banner */}
        {callData?.status === 'completed' && (
          <div style={{
            padding: '18px 24px',
            borderTop: '1px solid var(--border-default, #EBE9E5)',
            background: isConfirmed ? '#ECFDF5' : '#FFFBEB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isConfirmed ? '#D1FAE5' : '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isConfirmed ? '#059669' : '#D97706',
                flexShrink: 0,
              }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{
                  fontWeight: 700,
                  color: isConfirmed ? '#065F46' : '#92400E',
                  fontSize: '0.9375rem',
                }}>
                  {isConfirmed ? 'Hotel confirmed the change!' : 'Manual follow-up recommended'}
                </div>
                <div style={{ fontSize: '0.75rem', color: isConfirmed ? '#047857' : '#B45309' }}>
                  {isConfirmed
                    ? 'The check-in reschedule request has been agreed by the hotel.'
                    : 'The hotel requested direct verification or is currently unavailable.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {callData?.hotelPhone && !isConfirmed && (
                <a
                  href={`tel:${callData.hotelPhone}`}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #FCD34D',
                    color: '#92400E',
                    borderRadius: 12,
                    padding: '8px 14px',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Phone size={13} /> Call Directly
                </a>
              )}
              <button
                onClick={onClose}
                style={{
                  background: isConfirmed
                    ? 'var(--accent-gradient, linear-gradient(135deg, #F59E0B 0%, #D97706 100%))'
                    : 'var(--bg-surface, #FFFFFF)',
                  color: isConfirmed ? '#FFFFFF' : 'var(--text-primary, #1A1A1A)',
                  border: isConfirmed ? 'none' : '1px solid var(--border-default, #EBE9E5)',
                  borderRadius: 12,
                  padding: '8px 18px',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isConfirmed ? '0 2px 8px rgba(217, 119, 6, 0.25)' : 'none',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Fire a native browser notification when the tab is not focused/visible.
 * hotelPhone: if provided and action is call_hotel, clicking opens the phone dialer.
 * Feature-detected and wrapped in try/catch — safe everywhere.
 */
function _fireNativeNotification(title, body, hotelPhone) {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (document.visibilityState === 'visible') return; // tab focused, toast is enough
    if (Notification.permission !== 'granted') return;

    const n = new Notification(title, {
      body,
      icon: '/icon-12.png',
      requireInteraction: !!hotelPhone, // stay visible until user acts
      vibrate: hotelPhone ? [300, 100, 300, 100, 300] : [200, 100, 200],
    });

    if (hotelPhone) {
      n.onclick = () => {
        n.close();
        // Open phone dialer pre-filled with hotel number
        window.open(`tel:${hotelPhone.replace(/\s+/g, '')}`, '_self');
      };
    }
  } catch (_) {}
}

