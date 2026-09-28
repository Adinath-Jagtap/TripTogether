'use client';
import { useEffect, useState } from 'react';
import { useTrip } from './layout';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import {
  Plane, Building2, Car, Compass, Calendar, Train, Bus, DollarSign, Shield,
  Users, Plus, AlertTriangle, Zap, ArrowRight, CheckCircle2, TrendingUp, Sparkles, Clock, X, ExternalLink
} from 'lucide-react';
import { formatCurrency, formatTime, formatDateShort, getResilienceColor, getResilienceLabel, BOOKING_TYPES, getTripDuration } from '@/lib/utils';
import { getBookings, getExpenses, getLedgerEntries } from '@/lib/firebase/firestore';
import { evaluateTDREligibility, getTDRUrgencyStyle } from '@/lib/algorithms/tdrAgent';
import styles from './page.module.css';

const TypeIcon = ({ type, size = 16 }) => {
  const icons = { flight: Plane, hotel: Building2, transfer: Car, activity: Compass, event: Calendar, train: Train, bus: Bus };
  const Icon = icons[type] || Compass;
  return <Icon size={size} />;
};

export default function TripOverview() {
  const { trip, members } = useTrip();
  const { id } = useParams();
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tdrAlerts, setTdrAlerts] = useState([]); // active TDR banners
  const [dismissedTdrs, setDismissedTdrs] = useState(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        let b = [];
        try { b = await getBookings(id); } catch (_) {}
        if (b.length === 0 && typeof window !== 'undefined') {
          try {
            const cached = localStorage.getItem('cached_bookings_' + id);
            if (cached) b = JSON.parse(cached);
          } catch (_) {}
        }
        setBookings(b || []);

        // ── TDR Autopilot: check ledger for active tdr_alert entries ──
        // We use the ledger (event_type 'tdr_alert') rather than a separate table
        // to stay consistent with the existing hashChain ledger pattern.
        try {
          const ledger = await getLedgerEntries(id);
          const tdrEntries = ledger.filter(e => e.event_type === 'tdr_alert');
          // Find the most recent alert per booking_id (within last 30 min)
          const alertMap = new Map();
          const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
          for (const entry of tdrEntries) {
            const ts = entry.created_at?.toMillis?.() || entry.created_at?.seconds * 1000 || new Date(entry.created_at).getTime() || 0;
            if (ts > thirtyMinAgo) {
              const existing = alertMap.get(entry.booking_id);
              if (!existing || ts > (existing.ts || 0)) {
                alertMap.set(entry.booking_id, { ...entry, ts });
              }
            }
          }
          setTdrAlerts(Array.from(alertMap.values()));
        } catch (_) {}

        let e = [];
        try { e = await getExpenses(id); } catch (_) {}
        setExpenses(e || []);
      } catch (_) {}
      setLoading(false);
    };
    load();
  }, [id]);

  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalBudget = Number(trip?.budget) || 50000;
  const budgetLeft = Math.max(0, totalBudget - totalSpent);
  const spentPercent = Math.min(100, Math.round((totalSpent / totalBudget) * 100));

  const flights = bookings.filter(b => b.type === 'flight');
  const hotels = bookings.filter(b => b.type === 'hotel');
  const trains = bookings.filter(b => b.type === 'train');
  const buses = bookings.filter(b => b.type === 'bus');
  const activities = bookings.filter(b => b.type === 'activity');
  const transfers = bookings.filter(b => b.type === 'transfer');

  const atRisk = bookings.filter(b => b.risk_level === 'medium' || b.risk_level === 'high' || b.status === 'at_risk' || b.status === 'disrupted');
  const trackable = bookings.filter(b => (b.type === 'flight' && b.flight_number) || (b.type === 'train' && b.train_number));
  const upcoming = bookings
    .filter(b => new Date(b.start_datetime) > new Date())
    .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
    .slice(0, 3);

  const score = trip?.resilience_score || 85;
  const durationDays = getTripDuration(trip?.start_date, trip?.end_date);

  if (loading) {
    return (
      <div className="grid-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14 }} />)}
      </div>
    );
  }

  return (
    <div className={styles.container}>

      {/* ── TDR AUTOPILOT BANNERS ──────────────────────────────────────────────
          Shows when Indian Railways has delayed a train >3h and the window to
          file a TDR refund is still open (before departure).
          We do NOT file TDR autonomously — there is no public IRCTC API for
          that; it requires the user's own logged-in irctc.co.in session.
          This banner's job: detect, alert urgently, and hand off in one tap.
      ──────────────────────────────────────────────────────────────────────── */}
      {tdrAlerts
        .filter(alert => !dismissedTdrs.has(alert.booking_id))
        .map(alert => {
          const booking = bookings.find(b => b.id === alert.booking_id);
          const refundAmount = alert.details?.eligibleRefund || alert.amount || 0;
          const minutesRemaining = alert.details?.minutesRemaining || 0;
          const pnr = alert.details?.pnr || booking?.pnr || booking?.confirmation_number;
          const urgency = getTDRUrgencyStyle(minutesRemaining);

          const handleClaimRefund = async () => {
            // Step 1: Copy PNR for easy pasting into IRCTC TDR form
            if (pnr) {
              try {
                await navigator.clipboard.writeText(pnr);
                toast?.success?.('PNR copied — paste it into the TDR form on IRCTC');
              } catch (_) {
                toast?.info?.(`Your PNR is: ${pnr}`);
              }
            }
            // Step 2: Open IRCTC TDR filing page in new tab
            // The user must be logged in to their own IRCTC account.
            window.open('https://www.irctc.co.in/nget/train-search', '_blank', 'noopener,noreferrer');
          };

          return (
            <div key={alert.booking_id} style={{
              background: urgency.bg,
              border: `1.5px solid ${urgency.border}`,
              borderLeft: `5px solid ${urgency.color}`,
              borderRadius: 14,
              padding: '14px 16px',
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
                    {urgency.label}
                  </span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: urgency.color }}>
                    TDR Refund Window — {minutesRemaining} min left
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>{booking?.title || 'Your train'}</strong> is delayed by {alert.details?.delayMinutes || '180+'} minutes.
                  You may claim a <strong>{formatCurrency(refundAmount, trip?.currency)}</strong> full refund before departure.
                  {pnr && <span style={{ marginLeft: 6, fontFamily: 'monospace', background: '#E5E7EB', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem', color: '#111827' }}>PNR: {pnr}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleClaimRefund}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: urgency.color, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', transition: 'opacity 0.15s' }}
                  >
                    <ExternalLink size={13} /> Claim Refund on IRCTC
                  </button>
                  <span style={{ fontSize: '0.6875rem', color: '#6B7280', alignSelf: 'center' }}>
                    Tap to copy PNR + open IRCTC TDR form
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDismissedTdrs(prev => new Set([...prev, alert.booking_id]))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: urgency.color, opacity: 0.6, padding: 4, flexShrink: 0 }}
                aria-label="Dismiss TDR alert"
              >
                <X size={16} />
              </button>
            </div>
          );
        })
      }

      {/* ── DIGITAL TWIN & WEATHER RADAR HERO BANNER ── */}
      <div style={{
        background: 'linear-gradient(135deg, #FFFDF5 0%, #FFFBEB 100%)',
        border: '1px solid #FCD34D',
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        boxShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF3C7', border: '1px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B45309', flexShrink: 0 }}>
            <Zap size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
              <span style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#1F2937' }}>Weather-Driven Digital Twin Active</span>
              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: 8 }}>MIDNIGHT TASKS 1 &amp; 2</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#78350F' }}>
              Live Open-Meteo telemetry, Leaflet GIS radar map, real-world distress RSS feeds, and Nugen domain-aligned cascade assessment.
            </div>
          </div>
        </div>
        <Link href={`/trip/${id}/digital-twin`} className="btn btn-primary btn-sm" style={{ fontWeight: 700, padding: '8px 16px', background: '#D97706', borderColor: '#B45309' }}>
          Open Digital Twin Command Center →
        </Link>
      </div>

      {/* 1. ITINERARY COMPOSITION CARD */}
      <div className={styles.compositionCard}>
        <div className={styles.compositionHeader}>
          <div className={styles.compositionTitle}>
            <Sparkles size={16} color="var(--accent)" />
            <span>Itinerary Composition</span>
          </div>
          <span className={styles.compositionMeta}>
            <Clock size={12} /> {durationDays} Days · {bookings.length} {bookings.length === 1 ? 'Booking' : 'Bookings'}
          </span>
        </div>

        {/* Proportional Segmented Progress Track */}
        <div className={styles.segmentedTrack}>
          {bookings.length === 0 ? (
            <div className={styles.segmentItem} style={{ width: '100%', background: '#E5E7EB' }} />
          ) : (
            <>
              {flights.length > 0 && <div className={styles.segmentItem} style={{ width: `${(flights.length / bookings.length) * 100}%`, background: '#3B82F6' }} title={`${flights.length} Flights`} />}
              {hotels.length > 0 && <div className={styles.segmentItem} style={{ width: `${(hotels.length / bookings.length) * 100}%`, background: '#F59E0B' }} title={`${hotels.length} Hotels`} />}
              {trains.length > 0 && <div className={styles.segmentItem} style={{ width: `${(trains.length / bookings.length) * 100}%`, background: '#10B981' }} title={`${trains.length} Trains`} />}
              {buses.length > 0 && <div className={styles.segmentItem} style={{ width: `${(buses.length / bookings.length) * 100}%`, background: '#8B5CF6' }} title={`${buses.length} Buses`} />}
              {activities.length > 0 && <div className={styles.segmentItem} style={{ width: `${(activities.length / bookings.length) * 100}%`, background: '#EC4899' }} title={`${activities.length} Activities`} />}
              {transfers.length > 0 && <div className={styles.segmentItem} style={{ width: `${(transfers.length / bookings.length) * 100}%`, background: '#06B6D4' }} title={`${transfers.length} Transfers`} />}
            </>
          )}
        </div>

        {/* Refined Uniform Legend Chips */}
        <div className={styles.compositionLegend}>
          {flights.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#3B82F6' }} />
              <Plane size={13} color="#2563EB" /> {flights.length} {flights.length === 1 ? 'Flight' : 'Flights'}
            </span>
          )}
          {hotels.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#F59E0B' }} />
              <Building2 size={13} color="#D97706" /> {hotels.length} {hotels.length === 1 ? 'Hotel' : 'Hotels'}
            </span>
          )}
          {trains.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#10B981' }} />
              <Train size={13} color="#059669" /> {trains.length} {trains.length === 1 ? 'Train' : 'Trains'}
            </span>
          )}
          {buses.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#8B5CF6' }} />
              <Bus size={13} color="#7C3AED" /> {buses.length} {buses.length === 1 ? 'Bus' : 'Buses'}
            </span>
          )}
          {activities.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#EC4899' }} />
              <Compass size={13} color="#DB2777" /> {activities.length} {activities.length === 1 ? 'Activity' : 'Activities'}
            </span>
          )}
          {transfers.length > 0 && (
            <span className={styles.legendChip}>
              <span className={styles.dotIndicator} style={{ background: '#06B6D4' }} />
              <Car size={13} color="#0891B2" /> {transfers.length} {transfers.length === 1 ? 'Transfer' : 'Transfers'}
            </span>
          )}
        </div>
      </div>

      {/* 2. VISUAL METERS & STATS GRID */}
      <div className={styles.visualGrid}>
        {/* Budget Utilization Meter Card */}
        <div className={styles.meterCard}>
          <div className={styles.meterHeader}>
            <div>
              <div className={styles.meterLabel}>Budget Utilization</div>
              <div className={styles.meterValue}>
                {formatCurrency(totalSpent, trip?.currency)}
                <span className={styles.meterSubValue}> of {formatCurrency(totalBudget, trip?.currency)}</span>
              </div>
            </div>
            <div className={styles.percentBadge} style={{ background: spentPercent > 90 ? '#FEE2E2' : spentPercent > 75 ? '#FEF3C7' : '#ECFDF5', color: spentPercent > 90 ? '#991B1B' : spentPercent > 75 ? '#92400E' : '#065F46' }}>
              {spentPercent}% Spent
            </div>
          </div>

          <div className={styles.progressTrack}>
            <div
              className={styles.progressBar}
              style={{
                width: `${Math.max(5, spentPercent)}%`,
                background: spentPercent > 90 ? '#EF4444' : spentPercent > 75 ? '#F59E0B' : 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
              }}
            />
          </div>

          <div className={styles.meterFooter}>
            <span>Budget Remaining: <strong>{formatCurrency(budgetLeft, trip?.currency)}</strong></span>
            <span>Est. Daily: <strong>{formatCurrency(Math.round(totalSpent / Math.max(1, durationDays)), trip?.currency)}/day</strong></span>
          </div>
        </div>

        {/* Resilience Shield Gauge Card */}
        <div className={styles.meterCard}>
          <div className={styles.meterHeader}>
            <div>
              <div className={styles.meterLabel}>Resilience &amp; Schedule Shield</div>
              <div className={styles.meterValue} style={{ color: getResilienceColor(score) }}>
                {score}<span className={styles.meterSubValue}>/100</span>
              </div>
            </div>

            {/* Circular Gauge Ring */}
            <div className={styles.ringGauge}>
              <svg width="48" height="48" viewBox="0 0 36 36" className={styles.circularSvg}>
                <path className={styles.ringBg} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path
                  className={styles.ringFill}
                  strokeDasharray={`${score}, 100`}
                  stroke={getResilienceColor(score)}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <Shield size={18} color={getResilienceColor(score)} className={styles.shieldCenterIcon} />
            </div>
          </div>

          <div className={styles.resilienceSubText}>
            <CheckCircle2 size={14} color="#059669" />
            <span>{getResilienceLabel(score)} · {trackable.length} live transport trackers active</span>
          </div>

          <div className={styles.meterFooter}>
            <span>Total Bookings: <strong>{bookings.length}</strong></span>
            <span>At-Risk Items: <strong style={{ color: atRisk.length > 0 ? '#EF4444' : '#059669' }}>{atRisk.length}</strong></span>
          </div>
        </div>
      </div>

      {/* 3. TWO COLUMN CONTENT SECTION */}
      <div className={styles.twoCol}>
        {/* Left Column: Upcoming Bookings */}
        <div>
          <div className={styles.sectionHeader}>
            <h3>Upcoming Schedule</h3>
            <Link href={`/trip/${id}/itinerary`} className={styles.linkButton}>
              View Canvas →
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="card card-flat" style={{ padding: '32px 20px', textAlign: 'center', borderRadius: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#B45309' }}>
                <Calendar size={24} />
              </div>
              <h4 style={{ margin: '0 0 4px', fontSize: '0.9375rem' }}>No Upcoming Bookings</h4>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem', marginBottom: 16 }}>Import from PDF or use Voice AI to construct your itinerary graph.</p>
              <Link href={`/trip/${id}/itinerary`} className="btn btn-primary btn-sm">
                <Plus size={14} /> Add Bookings
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map(b => (
                <div key={b.id} className={styles.upcomingCard}>
                  <div className={styles.upcomingIconBox} style={{ color: BOOKING_TYPES[b.type]?.color || 'var(--accent)', background: (BOOKING_TYPES[b.type]?.color || 'var(--accent)') + '15' }}>
                    <TypeIcon type={b.type} size={20} />
                  </div>

                  <div className={styles.upcomingContent}>
                    <div className={styles.upcomingTitleRow}>
                      <span className={styles.upcomingTitle}>{b.title}</span>
                      {b.cost > 0 ? <span className={styles.upcomingCost}>{formatCurrency(b.cost, trip?.currency)}</span> : null}
                    </div>

                    <div className={styles.upcomingMeta}>
                      <span>{formatDateShort(b.start_datetime)} · {formatTime(b.start_datetime)}</span>
                      {b.origin_location && b.destination_location ? (
                        <span> · {b.origin_location} → {b.destination_location}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.badgeCol}>
                    <span className={`badge badge-${b.status === 'confirmed' ? 'success' : (b.status === 'at_risk' || b.status === 'delayed') ? 'warning' : 'danger'}`}>
                      {b.status === 'at_risk' ? 'At Risk' : b.status === 'disrupted' ? 'Disrupted' : b.status === 'delayed' ? 'Delayed' : (b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : 'Confirmed')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: At-Risk & Quick Actions */}
        <div>
          {atRisk.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className={styles.sectionHeader}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400E' }}>
                  <AlertTriangle size={18} color="#F59E0B" /> Schedule Risk Alerts ({atRisk.length})
                </h3>
              </div>
              {atRisk.map(b => {
                const isConfirmedDisrupt = b.status === 'disrupted';
                const titleColor = isConfirmedDisrupt ? '#991B1B' : '#92400E';
                const descColor = isConfirmedDisrupt ? '#B91C1C' : '#B45309';
                const pillBg = isConfirmedDisrupt ? '#FEE2E2' : '#FEF3C7';
                const pillBorder = isConfirmedDisrupt ? '#FCA5A5' : '#FDE68A';
                const pillColor = isConfirmedDisrupt ? '#DC2626' : '#B45309';
                const btnBorder = isConfirmedDisrupt ? '#FCA5A5' : '#FDE68A';
                const btnColor = isConfirmedDisrupt ? '#991B1B' : '#92400E';
                const pillLabel = isConfirmedDisrupt ? '🔴 DISRUPTED' : b.status === 'delayed' ? '⏰ DELAYED' : '⚠️ AT RISK';
                const riskDesc = b.risk_reason || (isConfirmedDisrupt ? 'Transport delay reported. Downstream itinerary connections impacted.' : 'Predictive schedule gap detected. No confirmed delay yet — monitor closely.');
                return (
                  <div key={b.id} className={styles.atRiskCard}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: titleColor, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                        <TypeIcon type={b.type} size={15} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                      </div>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: pillColor, background: pillBg, padding: '2px 8px', borderRadius: 12, border: `1px solid ${pillBorder}`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {pillLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: descColor, marginTop: 4, lineHeight: 1.4 }}>
                      {riskDesc}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', color: btnColor, opacity: 0.85, fontWeight: 500 }}>
                        {b.origin_location && b.destination_location ? `${b.origin_location} → ${b.destination_location}` : 'Transport Status Alert'}
                      </span>
                      <Link href={`/trip/${id}/disruption`} className="btn btn-secondary btn-sm" style={{ borderColor: btnBorder, color: btnColor, background: '#FFFFFF', fontWeight: 600, padding: '4px 10px', fontSize: '0.75rem' }}>
                        Open Disruption Center →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={styles.sectionHeader}>
            <h3>Quick Actions</h3>
          </div>
          <div className={styles.quickActionGrid}>
            <Link href={`/trip/${id}/itinerary`} className={styles.quickActionButton}>
              <div className={styles.quickActionIcon} style={{ background: '#EFF6FF', color: '#2563EB' }}>
                <Plus size={18} />
              </div>
              <div>
                <div className={styles.quickActionTitle}>Add Booking</div>
                <div className={styles.quickActionSub}>PDF, Voice or Manual</div>
              </div>
            </Link>

            <Link href={`/trip/${id}/expenses`} className={styles.quickActionButton}>
              <div className={styles.quickActionIcon} style={{ background: '#ECFDF5', color: '#059669' }}>
                <DollarSign size={18} />
              </div>
              <div>
                <div className={styles.quickActionTitle}>Log Expense</div>
                <div className={styles.quickActionSub}>Split group costs</div>
              </div>
            </Link>

            <Link href={`/trip/${id}/digital-twin`} className={styles.quickActionButton}>
              <div className={styles.quickActionIcon} style={{ background: '#FEF3C7', color: '#B45309' }}>
                <Zap size={18} />
              </div>
              <div>
                <div className={styles.quickActionTitle}>Digital Twin &amp; Weather</div>
                <div className={styles.quickActionSub}>GIS Map &amp; Nugen AI</div>
              </div>
            </Link>

            <Link href={`/trip/${id}/disruption`} className={styles.quickActionButton}>
              <div className={styles.quickActionIcon} style={{ background: '#FEF3C7', color: '#B45309' }}>
                <Zap size={18} />
              </div>
              <div>
                <div className={styles.quickActionTitle}>Disruption Studio</div>
                <div className={styles.quickActionSub}>AI recovery plans</div>
              </div>
            </Link>

            <Link href={`/trip/${id}/members`} className={styles.quickActionButton}>
              <div className={styles.quickActionIcon} style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                <Users size={18} />
              </div>
              <div>
                <div className={styles.quickActionTitle}>Invite Group</div>
                <div className={styles.quickActionSub}>Code: {trip?.invite_code}</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
