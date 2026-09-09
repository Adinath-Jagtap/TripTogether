'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Shield, Check, X, Clock, DollarSign, ArrowRight, Star } from 'lucide-react';
import { detectCascade } from '@/lib/algorithms/cascadeDetector';
import { formatCurrency, minutesToHours, getResilienceColor, BOOKING_TYPES } from '@/lib/utils';
import styles from './page.module.css';

export default function DisruptionPage() {
  const { trip, supabase, fetchTrip } = useTrip();
  const { id } = useParams();
  const toast = useToast();

  const [bookings, setBookings] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [disruptions, setDisruptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Simulation form
  const [simBooking, setSimBooking] = useState('');
  const [simType, setSimType] = useState('delay');
  const [simDelay, setSimDelay] = useState(180);
  const [simDesc, setSimDesc] = useState('');

  // Active disruption state
  const [activeDisruption, setActiveDisruption] = useState(null);
  const [cascadeResult, setCascadeResult] = useState([]);
  const [showCascade, setShowCascade] = useState(false);
  const [recoveryPlans, setRecoveryPlans] = useState([]);
  const [generatingPlans, setGeneratingPlans] = useState(false);

  const load = async () => {
    const { data: b } = await supabase.from('bookings').select('*').eq('trip_id', id).order('start_datetime');
    setBookings(b || []);
    const { data: d } = await supabase.from('booking_dependencies').select('*').eq('trip_id', id);
    setDependencies(d || []);
    const { data: dis } = await supabase.from('disruptions').select('*').eq('trip_id', id).order('created_at', { ascending: false });
    setDisruptions(dis || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const triggerDisruption = async () => {
    if (!simBooking) { toast.error('Select a booking to disrupt'); return; }
    const booking = bookings.find(b => b.id === simBooking);
    if (!booking) return;

    // Run cascade detection
    const affected = detectCascade(simBooking, dependencies, bookings, simType === 'delay' ? simDelay : 999);

    // Save disruption to DB
    const { data: disruption } = await supabase.from('disruptions').insert({
      trip_id: id,
      booking_id: simBooking,
      type: simType,
      severity: affected.length > 2 ? 'critical' : affected.length > 0 ? 'high' : 'medium',
      description: simDesc || `${simType === 'delay' ? `${simDelay} minute delay` : 'Cancellation'} on ${booking.title}`,
      delay_minutes: simType === 'delay' ? simDelay : null,
      is_simulated: true,
      affected_booking_ids: affected.map(a => a.booking_id),
      status: 'active',
    }).select().single();

    // Update booking statuses
    await supabase.from('bookings').update({ status: 'disrupted', risk_level: 'high' }).eq('id', simBooking);
    for (const a of affected) {
      await supabase.from('bookings').update({
        status: a.impact_type === 'missed' ? 'disrupted' : 'at_risk',
        risk_level: a.impact_type === 'missed' ? 'high' : 'medium',
        risk_reason: a.impact_description,
      }).eq('id', a.booking_id);
    }

    setActiveDisruption({ ...disruption, booking });
    setCascadeResult(affected);
    setShowCascade(true);
    toast.warning('Disruption triggered! Analyzing cascade impact...');

    // Generate recovery plans via AI
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
    } catch (err) {
      // Generate fallback plans if AI fails
      setRecoveryPlans([
        { plan_label: 'Plan A', summary: 'Cancel affected bookings and get refunds. Minimal cost but lose activities.', is_recommended: false, additional_cost: 0, refund_amount: affected.reduce((s, a) => s + (a.booking?.cost || 0), 0), time_impact_minutes: 0, convenience_score: 30, bookings_affected: affected.length, changes: [] },
        { plan_label: 'Plan B', summary: 'Reschedule affected bookings to later times. Some additional cost but preserves the experience.', is_recommended: true, additional_cost: 2000, refund_amount: 0, time_impact_minutes: simDelay, convenience_score: 70, bookings_affected: affected.length, changes: [] },
        { plan_label: 'Plan C', summary: 'Replace with premium alternatives for maximum convenience. Higher cost but best experience.', is_recommended: false, additional_cost: 5000, refund_amount: 0, time_impact_minutes: 30, convenience_score: 95, bookings_affected: affected.length, changes: [] },
      ]);
    }
    setGeneratingPlans(false);
    load();
  };

  const acceptPlan = async (plan) => {
    try {
      // 1. Mark active disruption as resolved
      if (activeDisruption?.id) {
        try {
          await supabase.from('disruptions').update({
            status: 'resolved',
            description: `${activeDisruption.description || 'Disruption'} (Resolved via ${plan.plan_label})`
          }).eq('id', activeDisruption.id);
        } catch (_) {}
      }

      // 2. Determine changes to apply
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

        changes = targets.map((b, idx) => {
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
            change_reason: `${activeDisruption?.type || 'Disruption'}: Times shifted to absorb delay and protect downstream connections.`
          };
        });
      }

      // 3. Apply changes to database and local storage
      const appliedList = [];
      for (const ch of changes) {
        if (!ch.booking_id) continue;
        const currentBooking = bookings.find(b => b.id === ch.booking_id);
        const originalTitle = ch.original_title || currentBooking?.title || 'Original Booking';
        const originalStart = ch.original_start || currentBooking?.start_datetime;
        const originalEnd = ch.original_end || currentBooking?.end_datetime;

        const metadata = {
          is_recovered: true,
          plan_label: plan.plan_label,
          disruption_type: activeDisruption?.type || 'Disruption',
          original_title: originalTitle,
          new_title: ch.new_title,
          original_start: originalStart,
          new_start: ch.new_start,
          original_end: originalEnd,
          new_end: ch.new_end,
          change_reason: ch.change_reason || plan.summary,
          applied_at: new Date().toISOString(),
        };

        const recoveryTag = `[RECOVERED_PLAN]:${JSON.stringify(metadata)}`;
        const newStatus = ch.action === 'cancel' ? 'cancelled' : 'rescheduled';

        try {
          await supabase.from('bookings').update({
            title: ch.new_title,
            start_datetime: ch.new_start,
            end_datetime: ch.new_end,
            status: newStatus,
            risk_level: 'low',
            risk_reason: recoveryTag,
          }).eq('id', ch.booking_id);
        } catch (err) {
          console.warn('Booking DB update notice:', err.message);
        }

        appliedList.push({
          booking_id: ch.booking_id,
          ...metadata,
        });
      }

      // Store in localStorage for instant sync with Itinerary page
      if (typeof window !== 'undefined') {
        const stored = JSON.parse(localStorage.getItem(`trip_recoveries_${id}`) || '[]');
        stored.unshift({
          plan_label: plan.plan_label,
          summary: plan.summary,
          applied_at: new Date().toISOString(),
          changes: appliedList,
        });
        localStorage.setItem(`trip_recoveries_${id}`, JSON.stringify(stored));
      }

      // 4. Record in Audit Ledger
      try {
        await supabase.from('ledger_entries').insert({
          trip_id: id,
          event_type: 'disruption_recovery',
          description: `${plan.plan_label} applied: ${appliedList.length} segments adjusted to recover schedule.`,
          amount: plan.additional_cost || 0,
        });
      } catch (_) {}

      setActiveDisruption(null);
      setCascadeResult([]);
      setShowCascade(false);
      setRecoveryPlans([]);
      toast.success(`${plan.plan_label} applied! Your itinerary has been updated with the recovery plan.`);
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

      {/* Risk Overview */}
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

        {/* Risk bar */}
        <div className={styles.riskBar}>
          {bookings.map(b => (
            <div
              key={b.id}
              className={styles.riskSegment}
              style={{
                flex: 1,
                background: b.risk_level === 'high' ? 'var(--danger)' : b.risk_level === 'medium' ? 'var(--warning)' : 'var(--success)',
              }}
              title={`${b.title}: ${b.risk_level} risk`}
            />
          ))}
        </div>
      </div>

      {/* Simulator */}
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
        <button className="btn btn-danger" onClick={triggerDisruption} style={{ marginTop: 12 }}>
          <Zap size={16} /> Trigger Disruption
        </button>
      </div>

      {/* Cascade Visualization */}
      <AnimatePresence>
        {showCascade && (
          <motion.div
            className={styles.cascadeSection}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
              Impact Cascade
            </h3>

            {/* Disrupted booking */}
            <motion.div
              className={`card card-flat ${styles.cascadeCard} ${styles.cascadeDisrupted}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Zap size={16} />
              <div>
                <strong>{activeDisruption?.booking?.title}</strong>
                <div style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>
                  {simType === 'delay' ? `Delayed ${minutesToHours(simDelay)}` : 'Cancelled'}
                </div>
              </div>
            </motion.div>

            {/* Affected bookings cascade */}
            {cascadeResult.map((a, i) => (
              <motion.div
                key={a.booking_id}
                className={`card card-flat ${styles.cascadeCard} ${styles[`cascade_${a.impact_type}`]}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.25 }}
              >
                <ArrowRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                <div>
                  <strong>{a.booking?.title}</strong>
                  <div style={{ fontSize: '0.8125rem', color: a.impact_type === 'missed' ? 'var(--danger)' : 'var(--warning)' }}>
                    {a.impact_description}
                  </div>
                </div>
                <span className={`badge ${a.impact_type === 'missed' ? 'badge-danger' : 'badge-warning'}`}>
                  {a.impact_type}
                </span>
              </motion.div>
            ))}

            {/* Impact summary */}
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

      {/* Recovery Plans */}
      {(generatingPlans || recoveryPlans.length > 0) && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ marginBottom: 16 }}>Recovery Plans</h3>

          {generatingPlans ? (
            <div style={{ display: 'flex', gap: 16 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 220, borderRadius: 12 }} />)}
            </div>
          ) : (
            <div className={styles.plansGrid}>
              {recoveryPlans.map((plan, i) => (
                <motion.div
                  key={i}
                  className={`card ${styles.planCard} ${plan.is_recommended ? styles.recommended : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className={styles.planHeader}>
                    <span className={styles.planLabel}>{plan.plan_label}</span>
                    {plan.is_recommended && <span className="badge badge-accent"><Star size={10} /> Recommended</span>}
                  </div>
                  <p className={styles.planSummary}>{plan.summary}</p>
                  <div className={styles.planMetrics}>
                    <div className={styles.planMetric}>
                      <DollarSign size={14} />
                      <span>+{formatCurrency(plan.additional_cost, trip?.currency)}</span>
                    </div>
                    <div className={styles.planMetric}>
                      <Clock size={14} />
                      <span>{minutesToHours(plan.time_impact_minutes)}</span>
                    </div>
                    <div className={styles.planMetric}>
                      <span>Convenience: {plan.convenience_score}/100</span>
                    </div>
                  </div>
                  <button className={`btn ${plan.is_recommended ? 'btn-primary' : 'btn-secondary'}`} style={{ width: '100%', marginTop: 12 }} onClick={() => acceptPlan(plan)}>
                    <Check size={16} /> Accept {plan.plan_label}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Past Disruptions */}
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
    </div>
  );
}
