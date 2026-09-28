'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';
import { Plus, Plane, Building2, Car, Compass, Calendar, Train, Bus, Trash2, X, Link2, Sparkles, ArrowRight, Phone, RotateCw } from 'lucide-react';
import { formatTime, formatDateShort, getDayNumber, getDayLabel, getTripDuration, BOOKING_TYPES, formatCurrency } from '@/lib/utils';
import ItineraryOnboarding from '@/components/itinerary/onboarding/ItineraryOnboarding';
import {
  getBookings, addBooking, updateBooking, deleteBooking,
  getBookingDependencies, addBookingDependency, deleteBookingDependency,
} from '@/lib/firebase/firestore';
import styles from './page.module.css';

const TypeIcons = { flight: Plane, hotel: Building2, transfer: Car, activity: Compass, event: Calendar, train: Train, bus: Bus };
const isTransport = (type) => ['flight', 'train', 'bus', 'transfer'].includes(type);

export default function ItineraryPage() {
  const { trip } = useTrip();
  const { id } = useParams();
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editFieldModal, setEditFieldModal] = useState(null);
  const [fieldInputValue, setFieldInputValue] = useState('');
  const [statusLoading, setStatusLoading] = useState({});
  const [delayAlerts, setDelayAlerts] = useState({});
  const [form, setForm] = useState({
    type: 'flight', title: '', start_datetime: '', end_datetime: '',
    origin_location: '', destination_location: '', venue: '',
    cost: '', cancellation_policy: 'free', vendor: '', confirmation_number: '',
    depends_on: '',
    flight_number: '', train_number: '', pnr: '', contact_phone: '', contact_name: '',
  });

  const parseRecovery = (booking) => {
    if (booking?.risk_reason && booking.risk_reason.includes('[RECOVERED_PLAN]:')) {
      try { return JSON.parse(booking.risk_reason.split('[RECOVERED_PLAN]:')[1]); } catch (_) { }
    }
    if (typeof window !== 'undefined') {
      try {
        const list = JSON.parse(localStorage.getItem(`trip_recoveries_${id}`) || '[]');
        for (const rec of list) {
          const ch = rec.changes?.find(c => c.booking_id === booking?.id);
          if (ch) return { is_recovered: true, plan_label: rec.plan_label, ...ch, change_reason: ch.change_reason || rec.summary };
        }
      } catch (_) { }
    }
    return null;
  };

  const isTrackable = (b) => (b.type === 'flight' && b.flight_number) || (b.type === 'train' && b.train_number);

  const load = async () => {
    let b = [];
    try { b = await getBookings(id); } catch (_) { }
    if (b.length === 0 && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('cached_bookings_' + id);
        if (cached) b = JSON.parse(cached);
      } catch (_) { }
    }
    setBookings(b);
    let d = [];
    try { d = await getBookingDependencies(id); } catch (_) { }
    setDependencies(d);
    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      let b = [];
      try { b = await getBookings(id); } catch (_) { }
      if (b.length === 0 && typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('cached_bookings_' + id);
          if (cached) b = JSON.parse(cached);
        } catch (_) { }
      }
      setBookings(b);
      let d = [];
      try { d = await getBookingDependencies(id); } catch (_) { }
      setDependencies(d);
      setLoading(false);
      // Auto-check all trackable bookings on load
      autoCheckAll(b);
    };
    init();
  }, [id]);

  // Refresh Firestore data every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [id]);

  const checkTransportStatus = async (b, silent = false) => {
    if (!b.id) return;
    if (!silent) setStatusLoading(p => ({ ...p, [b.id]: true }));
    try {
      const endpoint = b.type === 'flight' ? '/api/transport/flight-status' : '/api/transport/train-status';
      const body = b.type === 'flight'
        ? { flight_number: b.flight_number, date: b.start_datetime?.slice(0, 10), tripId: id, bookingId: b.id, last_checked_at: b.last_checked_at }
        : { train_number: b.train_number, date: b.start_datetime?.slice(0, 10), tripId: id, bookingId: b.id, last_checked_at: b.last_checked_at };

      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (data.cached) {
        // Already fresh — just reload from Firestore to show existing badge
        await load();
      } else if (res.ok && data.status) {
        if (data.delay_minutes >= 60) {
          setDelayAlerts(p => ({ ...p, [b.id]: { delayMin: data.delay_minutes, status: data.status } }));
        }
        await load();
      }
      // 404 from train/flight = no live data (train not running yet) — show nothing, don't alert
    } catch (_) { }
    if (!silent) setStatusLoading(p => ({ ...p, [b.id]: false }));
  };

  // Auto-check all trackable bookings on page load (staggered to avoid hammering APIs)
  const autoCheckAll = async (bList) => {
    const trackable = bList.filter(b => b.id && (
      (b.type === 'flight' && b.flight_number) ||
      (b.type === 'train' && b.train_number)
    ));
    for (let i = 0; i < trackable.length; i++) {
      await new Promise(r => setTimeout(r, i * 1200)); // stagger by 1.2s each
      checkTransportStatus(trackable[i], true);
    }
  };

  const handleBatchImport = async (newBookings, newDeps) => {
    try {
      const tempToDbId = {};
      const savedBookings = [];
      const existingDbIds = new Set(bookings.map(b => b.id).filter(Boolean));
      const confirmedDbIds = new Set(newBookings.map(b => b.id).filter(Boolean));

      // Remove deleted bookings
      const toDelete = bookings.filter(eb => eb.id && !confirmedDbIds.has(eb.id));
      for (const del of toDelete) {
        try { await deleteBooking(id, del.id); } catch (_) { }
      }

      // Also delete all dependencies and re-insert
      for (const dep of dependencies) {
        try { await deleteBookingDependency(id, dep.id); } catch (_) { }
      }

      // Upsert bookings
      for (const b of newBookings) {
        const dayNum = getDayNumber(trip?.start_date, b.start_datetime);
        const payload = {
          trip_id: id,
          type: b.type || 'activity',
          title: b.title,
          start_datetime: b.start_datetime,
          end_datetime: b.end_datetime,
          origin_location: b.origin_location || null,
          destination_location: b.destination_location || null,
          venue: b.venue || null,
          cost: Number(b.cost) || 0,
          cancellation_policy: b.cancellation_policy || 'Standard',
          vendor: b.vendor || null,
          confirmation_number: b.confirmation_number || null,
          day_number: dayNum,
          status: b.status || 'confirmed',
          risk_level: b.risk_level || 'low',
          risk_reason: b.risk_reason || null,
          flight_number: b.flight_number || null,
          train_number: b.train_number || null,
          pnr: b.pnr || null,
          contact_phone: b.contact_phone || null,
          contact_name: b.contact_name || null,
          live_status: b.live_status || null,
          delay_minutes: b.delay_minutes || 0,
          last_checked_at: b.last_checked_at || null,
        };

        if (b.id && existingDbIds.has(b.id)) {
          try {
            await updateBooking(id, b.id, payload);
            savedBookings.push({ id: b.id, ...payload });
            tempToDbId[b.id] = b.id;
            if (b.temp_id) tempToDbId[b.temp_id] = b.id;
          } catch (_) {
            savedBookings.push({ id: b.id, ...payload });
          }
        } else {
          try {
            const saved = await addBooking(id, payload);
            savedBookings.push(saved);
            if (b.temp_id) tempToDbId[b.temp_id] = saved.id;
            if (b.id) tempToDbId[b.id] = saved.id;
          } catch (_) {
            const fallbackId = b.temp_id || `b_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            savedBookings.push({ id: fallbackId, ...payload });
            if (b.temp_id) tempToDbId[b.temp_id] = fallbackId;
            if (b.id) tempToDbId[b.id] = fallbackId;
          }
        }
      }

      // Insert dependencies
      if (newDeps && newDeps.length > 0) {
        for (const d of newDeps) {
          const upId = tempToDbId[d.upstream_temp_id] || tempToDbId[d.upstream_booking_id] || d.upstream_booking_id;
          const downId = tempToDbId[d.downstream_temp_id] || tempToDbId[d.downstream_booking_id] || d.downstream_booking_id;
          if (upId && downId && upId !== downId) {
            try {
              await addBookingDependency(id, {
                trip_id: id,
                upstream_booking_id: upId,
                downstream_booking_id: downId,
                buffer_minutes: d.buffer_minutes || 60,
                dependency_type: d.dependency_type || 'sequential',
              });
            } catch (_) { }
          }
        }
      }

      if (typeof window !== 'undefined') {
        try { localStorage.setItem('cached_bookings_' + id, JSON.stringify(savedBookings)); } catch (_) { }
      }

      toast.success(`Itinerary canvas confirmed! Synced ${savedBookings.length} bookings.`);
      setShowAiModal(false);
      await load();
    } catch (err) {
      console.warn('Batch import exception:', err);
      toast.success('Itinerary updated!');
      setShowAiModal(false);
      await load();
    }
  };

  const updateForm = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleAdd = async () => {
    if (!form.title || !form.start_datetime || !form.end_datetime) {
      toast.error('Title, start and end time are required');
      return;
    }
    const dayNum = getDayNumber(trip.start_date, form.start_datetime);
    try {
      const saved = await addBooking(id, {
        trip_id: id,
        type: form.type,
        title: form.title,
        start_datetime: form.start_datetime,
        end_datetime: form.end_datetime,
        origin_location: form.origin_location || null,
        destination_location: form.destination_location || null,
        venue: form.venue || null,
        cost: form.cost ? Number(form.cost) : 0,
        cancellation_policy: form.cancellation_policy,
        vendor: form.vendor || null,
        confirmation_number: form.confirmation_number || null,
        day_number: dayNum,
        status: 'confirmed',
        risk_level: 'low',
        flight_number: form.flight_number || null,
        train_number: form.train_number || null,
        pnr: form.pnr || null,
        contact_phone: form.contact_phone || null,
        contact_name: form.contact_name || null,
        live_status: null,
        delay_minutes: 0,
        last_checked_at: null,
      });

      if (form.depends_on && saved.id) {
        await addBookingDependency(id, {
          trip_id: id,
          upstream_booking_id: form.depends_on,
          downstream_booking_id: saved.id,
          dependency_type: 'sequential',
          buffer_minutes: 60,
        });
      }

      toast.success('Booking added!');
      setShowModal(false);
      setForm({ type: 'flight', title: '', start_datetime: '', end_datetime: '', origin_location: '', destination_location: '', venue: '', cost: '', cancellation_policy: 'free', vendor: '', confirmation_number: '', depends_on: '', flight_number: '', train_number: '', pnr: '', contact_phone: '', contact_name: '' });
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to add booking');
    }
  };

  const handleDelete = async (bookingId) => {
    if (!confirm('Delete this booking?')) return;
    try { await deleteBooking(id, bookingId); } catch (_) { }
    toast.success('Booking deleted');
    load();
  };

  const handleSaveFieldInput = async () => {
    if (!editFieldModal || !fieldInputValue.trim()) {
      toast.warning('Please enter a valid value.');
      return;
    }

    try {
      const { bookingId, field, fieldName } = editFieldModal;
      const cleanVal = field === 'flight_number' ? fieldInputValue.toUpperCase().trim() : fieldInputValue.trim();
      
      await updateBooking(id, bookingId, { [field]: cleanVal });
      toast.success(`✓ Updated ${fieldName}! Live tracking enabled.`);
      setEditFieldModal(null);
      setFieldInputValue('');
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to update booking field.');
    }
  };

  // Group bookings by day
  const days = {};
  const numDays = getTripDuration(trip?.start_date, trip?.end_date);
  for (let d = 1; d <= numDays; d++) days[d] = [];
  for (const b of bookings) {
    const day = b.day_number || getDayNumber(trip?.start_date, b.start_datetime);
    if (!days[day]) days[day] = [];
    days[day].push(b);
  }

  const depMap = {};
  for (const d of dependencies) depMap[d.downstream_booking_id] = d.upstream_booking_id;
  const statusBadge = (s, delay) => {
    if (s === 'cancelled') return { label: '🔴 Cancelled', color: '#DC2626', bg: '#FEF2F2' };
    if (s === 'delayed') return { label: `🟡 Delayed ${delay}m`, color: '#D97706', bg: '#FFFBEB' };
    if (s === 'on_time') return { label: '🟢 On Time', color: '#15803D', bg: '#F0FDF4' };
    return null;
  };

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />;

  return (
    <div>
      {/* Delay alert banners — shown above everything */}
      {Object.entries(delayAlerts).map(([bookingId, alert]) => {
        const b = bookings.find(bk => bk.id === bookingId);
        if (!b) return null;
        return (
          <div key={bookingId} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '0.9375rem' }}>⚠️ {b.flight_number || b.train_number} is {alert.status === 'cancelled' ? 'cancelled' : `delayed by ${alert.delayMin} minutes`}</div>
              <div style={{ color: '#B91C1C', fontSize: '0.8125rem', marginTop: 2 }}>{b.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setDelayAlerts(p => { const n = { ...p }; delete n[bookingId]; return n; })}>Dismiss</button>
              <Link href={`/trip/${id}/disruption`} className="btn btn-primary btn-sm">Open Disruption Center →</Link>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2>Itinerary</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAiModal(true)}>
            <Sparkles size={14} color="var(--color-primary)" /> AI Import
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Trip Stats Bar */}
      {bookings.length > 0 && (() => {
        const trackable = bookings.filter(b => isTrackable(b));
        const totalCost = bookings.reduce((s, b) => s + (Number(b.cost) || 0), 0);
        const atRisk = bookings.filter(b => b.status === 'at_risk' || b.status === 'disrupted').length;
        const recovered = bookings.filter(b => b.status === 'rescheduled' || (b.risk_reason && b.risk_reason.includes('[RECOVERED_PLAN]:'))).length;
        return (
          <div className={styles.statsBar}>
            <div className={styles.statCard}><div className={`${styles.statValue} ${styles.statBlue}`}>{bookings.length}</div><div className={styles.statLabel}>Bookings</div></div>
            <div className={styles.statCard}><div className={`${styles.statValue} ${styles.statAccent}`}>₹{(totalCost / 1000).toFixed(0)}K</div><div className={styles.statLabel}>Total Cost</div></div>
            <div className={styles.statCard}><div className={`${styles.statValue} ${styles.statPurple}`}>{trackable.length}</div><div className={styles.statLabel}>Live Tracked</div></div>
            <div className={styles.statCard}><div className={`${styles.statValue}`} style={{ color: atRisk > 0 ? '#EF4444' : recovered > 0 ? '#F59E0B' : '#22C55E' }}>{atRisk > 0 ? `⚠ ${atRisk}` : recovered > 0 ? `⚡ ${recovered}` : '✓ Clear'}</div><div className={styles.statLabel}>Status</div></div>
          </div>
        );
      })()}

      {/* Live Transport Tracker Panel */}
      {bookings.some(b => isTrackable(b)) && (
        <div className={styles.trackerPanel}>
          <div className={styles.trackerHeader}>
            <div className={styles.trackerTitleArea}>
              <span className={styles.pulseRadarDot} />
              <div>
                <div className={styles.trackerTitle}>LIVE FLIGHT &amp; TRAIN STATUS</div>
                <div className={styles.trackerSubtitle}>Real-time schedule monitoring &amp; delay tracking</div>
              </div>
            </div>
            <div className={styles.trackerBadge}>
              {bookings.filter(b => isTrackable(b)).length} Live Tracked Statuses
            </div>
          </div>

          <div className={styles.trackerGrid}>
            {bookings.filter(b => isTrackable(b)).map(b => {
              const s = b.live_status;
              const delay = b.delay_minutes || 0;
              const isDelayed = s === 'delayed';
              const isOnTime = s === 'on_time';
              const isCancelled = s === 'cancelled';
              const isFlight = b.type === 'flight';

              const getDelayedTime = (isoString, delayMin) => {
                if (!isoString || !delayMin) return null;
                try {
                  const d = new Date(isoString);
                  d.setMinutes(d.getMinutes() + Number(delayMin));
                  return formatTime(d.toISOString());
                } catch (_) { return null; }
              };
              const delayedTimeStr = isDelayed ? getDelayedTime(b.start_datetime, delay) : null;

              const statusCardState = isDelayed ? styles.cardDelayedStatus : isOnTime ? styles.cardOnTimeStatus : isCancelled ? styles.cardCancelledStatus : '';

              return (
                <div
                  key={b.id}
                  className={`${styles.statusCardContainer} ${statusCardState}`}
                  onClick={() => checkTransportStatus(b)}
                  title="Click to sync live status"
                >
                  <div className={styles.statusTopRow}>
                    <div className={styles.transportTag}>
                      {isFlight ? <Plane size={16} color="#2563EB" /> : <Train size={16} color="#059669" />}
                      <span>{b.flight_number || b.train_number}</span>
                    </div>

                    {/* Prominent Live Status Pill */}
                    {isOnTime && (
                      <span className={styles.statusPillGreen}>
                        <span className={styles.dotGreen} /> ON TIME
                      </span>
                    )}
                    {isDelayed && (
                      <span className={styles.statusPillAmber}>
                        <span className={styles.dotAmber} /> LATE (+{delay}m)
                      </span>
                    )}
                    {isCancelled && (
                      <span className={styles.statusPillRed}>
                        🚨 CANCELLED
                      </span>
                    )}
                    {!s && (
                      <span className={styles.statusPillGray}>
                        ⚪ SYNC STATUS
                      </span>
                    )}
                  </div>

                  <div className={styles.transportFullTitle}>
                    {b.title}
                  </div>

                  {b.origin_location && b.destination_location && (
                    <div className={styles.statusRouteBar}>
                      <span className={styles.statusRouteCity}>{b.origin_location.split('(')[0].trim()}</span>
                      <div className={styles.statusRouteLine}>
                        <span className={styles.statusRouteIcon}>
                          {isFlight ? <Plane size={13} color="#2563EB" /> : <Train size={13} color="#059669" />}
                        </span>
                      </div>
                      <span className={styles.statusRouteCity}>{b.destination_location.split('(')[0].trim()}</span>
                    </div>
                  )}

                  <div className={styles.statusFooterRow}>
                    <div className={styles.statusTimeInfo}>
                      {isDelayed ? (
                        <span>
                          <span className={styles.statusStruckTime}>{formatTime(b.start_datetime)}</span>
                          <span className={styles.statusDelayedVal}>➔ {delayedTimeStr || formatTime(b.start_datetime)} ({delay}m late)</span>
                        </span>
                      ) : (
                        <span>Scheduled Dep: {formatTime(b.start_datetime)}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.statusSyncBtn}
                      disabled={!!statusLoading[b.id]}
                      onClick={(e) => { e.stopPropagation(); checkTransportStatus(b); }}
                    >
                      <RotateCw size={11} className={statusLoading[b.id] ? styles.refreshSpin : ''} style={{ display: 'inline-block' }} />
                      <span>{statusLoading[b.id] ? 'Syncing...' : 'Sync'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {bookings.some(b => b.status === 'rescheduled' || (b.risk_reason && b.risk_reason.includes('[RECOVERED_PLAN]:'))) && (
        <div style={{ background: 'linear-gradient(135deg, #FEF3C7, #FFFBEB)', border: '1px solid #F59E0B', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={20} color="#B45309" />
            <div>
              <div style={{ fontWeight: 700, color: '#92400E' }}>Disruption Recovery Active</div>
              <div style={{ color: '#78350F', fontSize: '0.8125rem', marginTop: 2 }}>Your itinerary was dynamically updated following an accepted disruption recovery plan.</div>
            </div>
          </div>
          <Link href={`/trip/${id}/disruption`} className="btn btn-secondary btn-sm" style={{ borderColor: '#D97706', color: '#92400E', background: '#FFFFFF' }}>
            Disruption Center
          </Link>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Calendar size={48} /></div>
          <h3>No bookings yet</h3>
          <p>Add your flights, hotels, activities and more, or import directly from booking PDFs and voice dictation.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setShowAiModal(true)}>
              <Sparkles size={16} color="var(--color-primary)" /> AI Import / Dictate
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.timeline}>
          {Object.entries(days).map(([day, dayBookings]) => (
            <div key={day} className={styles.dayGroup}>
              <div className={styles.dayHeader}>
                <span className={styles.dayNum}>Day {day}</span>
                <span className={styles.dayDate}>{getDayLabel(trip?.start_date, Number(day))}</span>
              </div>
              {dayBookings.length === 0 ? (
                <div className={styles.emptyDay}><p>No bookings for this day</p></div>
              ) : (
                dayBookings.map(b => {
                  const Icon = TypeIcons[b.type] || Compass;
                  const color = BOOKING_TYPES[b.type]?.color || 'var(--accent)';
                  const hasDepUp = depMap[b.id];
                  const recovery = parseRecovery(b);
                  const isRecovered = Boolean(recovery) || b.status === 'rescheduled';
                  const isDelayed = b.live_status === 'delayed';
                  const isOnTime = b.live_status === 'on_time';

                  const getDelayedTime = (isoString, delayMin) => {
                    if (!isoString || !delayMin) return null;
                    try {
                      const d = new Date(isoString);
                      d.setMinutes(d.getMinutes() + Number(delayMin));
                      return formatTime(d.toISOString());
                    } catch (_) { return null; }
                  };

                  const typeClass = styles[`type${b.type.charAt(0).toUpperCase()}${b.type.slice(1)}`] || '';
                  const trackableClass = isTrackable(b) ? styles.trackable : '';
                  const cardBorderColor = isDelayed ? '#F59E0B' : isOnTime ? '#10B981' : isRecovered ? '#F59E0B' : color;

                  return (
                    <div key={b.id}>
                      {hasDepUp && (
                        <div className={styles.depLine}><Link2 size={12} /> depends on previous</div>
                      )}
                      <div className={`card card-flat ${styles.bookingCard} ${typeClass} ${trackableClass}`} style={{ borderLeftColor: cardBorderColor, background: isDelayed ? 'linear-gradient(135deg, #FFFDF5 0%, #FFFBEB 100%)' : undefined }}>
                        <div className={styles.bookingHeader}>
                          <div className={styles.bookingIcon} style={{ color: cardBorderColor }}><Icon size={20} /></div>

                          <div className={styles.bookingInfo}>
                            {/* Title & Cost Header */}
                            <div className={styles.titleRow}>
                              <div className={styles.bookingTitle}>
                                {b.title}
                              </div>
                              {b.cost > 0 && <span className={styles.bookingCost}>{formatCurrency(b.cost, trip?.currency)}</span>}
                            </div>

                            {/* Schedule & Route line */}
                            <div className={styles.bookingTime}>
                              <span>{formatTime(b.start_datetime)} – {formatTime(b.end_datetime)}</span>
                              {b.venue ? <span> · {b.venue}</span> : null}
                              {b.origin_location && b.destination_location ? <span> · {b.origin_location} → {b.destination_location}</span> : null}
                            </div>

                            {/* Badges & Tracking Status Row */}
                            <div className={styles.badgeRow}>
                              {b.flight_number && (
                                <span className={styles.flightChip}>
                                  <Plane size={11} /> {b.flight_number}
                                </span>
                              )}
                              {b.train_number && (
                                <span className={styles.trainChip}>
                                  <Train size={11} /> {b.train_number}
                                </span>
                              )}
                              {b.contact_phone && (
                                <span className={styles.phoneChip}>
                                  ☎ AI Callable
                                </span>
                              )}
                              {isRecovered && (
                                <span className={styles.recoveredChip}>
                                  ⚡ Plan Adjusted
                                </span>
                              )}
                              {isTrackable(b) && (
                                <span className={isDelayed ? styles.badgeDelayedPill : isOnTime ? styles.badgeOnTimePill : styles.badgeDefaultPill}>
                                  {isDelayed ? `⚠️ Delayed +${b.delay_minutes}m` : isOnTime ? '🟢 On Time' : '⚪ Not Checked'}
                                </span>
                              )}
                              {isTrackable(b) && (
                                <button
                                  type="button"
                                  className={styles.miniSyncBtn}
                                  disabled={!!statusLoading[b.id]}
                                  onClick={() => checkTransportStatus(b)}
                                  title="Refresh live status"
                                >
                                  <RotateCw size={11} className={statusLoading[b.id] ? styles.refreshSpin : ''} style={{ display: 'inline-block' }} />
                                  <span>{statusLoading[b.id] ? 'Syncing...' : 'Sync'}</span>
                                </button>
                              )}
                              <span className={`badge badge-${b.status === 'confirmed' ? 'success' : isRecovered ? 'warning' : b.status === 'at_risk' ? 'warning' : b.status === 'disrupted' ? 'danger' : 'neutral'}`}>
                                {isRecovered ? 'rescheduled' : b.status}
                              </span>
                            </div>

                            {/* Prominent Delay or On-Time Banner */}
                            {isDelayed && (
                              <div className={styles.delayNoticeBox}>
                                <div className={styles.delayNoticeTitle}>
                                  <span className={styles.statusDotYellow} style={{ width: 8, height: 8 }} />
                                  <span>⚠️ TRANSPORT DELAYED BY {b.delay_minutes || 0} MINUTES</span>
                                </div>
                                <div className={styles.delayNoticeDetails}>
                                  <span>Scheduled: <span className={styles.struckTimeDark}>{formatTime(b.start_datetime)}</span></span>
                                  <span>➔</span>
                                  <span>Estimated Departure: <strong style={{ color: '#B45309', fontWeight: 800, fontSize: '0.8125rem' }}>{getDelayedTime(b.start_datetime, b.delay_minutes)}</strong></span>
                                </div>
                              </div>
                            )}

                            {isOnTime && (
                              <div className={styles.onTimeNoticeBox}>
                                <span className={styles.statusDotGreen} style={{ width: 7, height: 7 }} />
                                <span>On Time &amp; Operating On Schedule</span>
                              </div>
                            )}
                          </div>

                          {/* Delete action */}
                          <div className={styles.actionColumn}>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(b.id)} title="Delete booking"><Trash2 size={14} /></button>
                          </div>
                        </div>

                        {recovery && (
                          <div style={{ marginTop: 14, padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, fontSize: '0.8125rem' }}>
                            <div style={{ fontWeight: 700, color: '#B45309', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={14} /> Plan Changed via Disruption Recovery ({recovery.plan_label || 'Recovery Plan'})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, background: '#FFFFFF', padding: '10px 12px', borderRadius: 6, border: '1px dashed #F59E0B' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>This Was Your Plan</div>
                                <div style={{ textDecoration: 'line-through', color: '#6B7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recovery.original_title || b.title}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 2 }}>{formatTime(recovery.original_start || b.start_datetime)} – {formatTime(recovery.original_end || b.end_datetime)}</div>
                              </div>
                              <div style={{ color: '#B45309', fontWeight: 900, fontSize: '1.25rem', flexShrink: 0 }}>➔</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: 2 }}>Changed To (Current Plan)</div>
                                <div style={{ color: '#1F2937', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
                                <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600, marginTop: 2 }}>{formatTime(b.start_datetime)} – {formatTime(b.end_datetime)}</div>
                              </div>
                            </div>
                            {recovery.change_reason && <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#78350F' }}><strong>Why this changed:</strong> {recovery.change_reason}</div>}
                          </div>
                        )}

                        {/* Missing tracking field banners */}
                        {b.type === 'flight' && !b.flight_number && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 8, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ color: '#92400E' }}>✈ Add flight number to enable live tracking</span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setFieldInputValue(b.flight_number || '');
                                setEditFieldModal({
                                  bookingId: b.id,
                                  field: 'flight_number',
                                  fieldName: 'flight number',
                                  title: 'Add Flight Number',
                                  subtitle: `Enable live flight status tracking for "${b.title}"`,
                                  label: 'Flight Number (IATA Code)',
                                  placeholder: 'e.g. 6E-2341 or AI-505',
                                  icon: Plane,
                                  iconColor: '#2563EB',
                                  bg: '#EFF6FF',
                                  suggestions: ['6E-2341', 'AI-505', 'UK-834', 'NH-830']
                                });
                              }}
                            >
                              Add
                            </button>
                          </div>
                        )}
                        {b.type === 'train' && !b.train_number && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ color: '#15803D' }}>🚂 Add train number to enable live tracking</span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setFieldInputValue(b.train_number || '');
                                setEditFieldModal({
                                  bookingId: b.id,
                                  field: 'train_number',
                                  fieldName: 'train number',
                                  title: 'Add Train Number',
                                  subtitle: `Enable live NTES tracking & delay alerts for "${b.title}"`,
                                  label: 'Train Number (5-Digit Code)',
                                  placeholder: 'e.g. 12301 or 22230',
                                  icon: Train,
                                  iconColor: '#059669',
                                  bg: '#F0FDF4',
                                  suggestions: ['12301', '22230', '12951', '12002']
                                });
                              }}
                            >
                              Add
                            </button>
                          </div>
                        )}
                        {b.type === 'hotel' && !b.contact_phone && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: 8, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ color: '#1D4ED8' }}>🏨 Add hotel phone to enable AI calling</span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                setFieldInputValue(b.contact_phone || '');
                                setEditFieldModal({
                                  bookingId: b.id,
                                  field: 'contact_phone',
                                  fieldName: 'hotel phone number',
                                  title: 'Add Hotel Phone Number',
                                  subtitle: `Enable AI Voice Assistant calling for "${b.title}"`,
                                  label: 'Hotel Phone Number',
                                  placeholder: 'e.g. +918369848711',
                                  icon: Phone,
                                  iconColor: '#7C3AED',
                                  bg: '#F5F3FF',
                                  suggestions: ['+918369848711', '+918002345678']
                                });
                              }}
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Booking Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '90vh' }}>
            <div className="modal-header">
              <h3>Add Booking</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input form-select" value={form.type} onChange={e => updateForm('type', e.target.value)}>
                  {Object.entries(BOOKING_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="e.g., Flight DEL→GOI" />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Start *</label>
                  <input type="datetime-local" className="form-input" value={form.start_datetime} onChange={e => updateForm('start_datetime', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">End *</label>
                  <input type="datetime-local" className="form-input" value={form.end_datetime} onChange={e => updateForm('end_datetime', e.target.value)} />
                </div>
              </div>
              {isTransport(form.type) && (
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Origin</label>
                    <input className="form-input" value={form.origin_location} onChange={e => updateForm('origin_location', e.target.value)} placeholder="Delhi" />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Destination</label>
                    <input className="form-input" value={form.destination_location} onChange={e => updateForm('destination_location', e.target.value)} placeholder="Goa" />
                  </div>
                </div>
              )}
              {!isTransport(form.type) && (
                <div className="form-group">
                  <label className="form-label">Venue</label>
                  <input className="form-input" value={form.venue} onChange={e => updateForm('venue', e.target.value)} placeholder="Taj Fort Aguada" />
                </div>
              )}
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Cost</label>
                  <input type="number" className="form-input" value={form.cost} onChange={e => updateForm('cost', e.target.value)} placeholder="8500" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Cancellation</label>
                  <select className="form-input form-select" value={form.cancellation_policy} onChange={e => updateForm('cancellation_policy', e.target.value)}>
                    <option value="free">Free</option>
                    <option value="partial_refund">Partial Refund</option>
                    <option value="non_refundable">Non-refundable</option>
                  </select>
                </div>
              </div>
              {/* Flight tracking field */}
              {form.type === 'flight' && (
                <div className="form-group">
                  <label className="form-label">Flight Number</label>
                  <input className="form-input" value={form.flight_number} onChange={e => updateForm('flight_number', e.target.value.toUpperCase())} placeholder="e.g. 6E-2341" />
                </div>
              )}
              {/* Train tracking field */}
              {form.type === 'train' && (
                <div className="form-group">
                  <label className="form-label">Train Number</label>
                  <input className="form-input" value={form.train_number} onChange={e => updateForm('train_number', e.target.value)} placeholder="e.g. 12301" />
                </div>
              )}
              {/* Hotel contact fields */}
              {form.type === 'hotel' && (
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Hotel Phone</label>
                    <input className="form-input" value={form.contact_phone} onChange={e => updateForm('contact_phone', e.target.value)} placeholder="+918369848711" />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Contact Name</label>
                    <input className="form-input" value={form.contact_name} onChange={e => updateForm('contact_name', e.target.value)} placeholder="Front Desk" />
                  </div>
                </div>
              )}
              {/* PNR for any transport type */}
              {['flight', 'train', 'bus'].includes(form.type) && (
                <div className="form-group">
                  <label className="form-label">PNR / Booking Ref</label>
                  <input className="form-input" value={form.pnr} onChange={e => updateForm('pnr', e.target.value)} placeholder="e.g. PNR4829173" />
                </div>
              )}
              {bookings.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Depends on (optional)</label>
                  <select className="form-input form-select" value={form.depends_on} onChange={e => updateForm('depends_on', e.target.value)}>
                    <option value="">None</option>
                    {bookings.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>Add Booking</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Onboarding Modal */}
      {showAiModal && (
        <div className="modal-overlay" onClick={() => setShowAiModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 1040, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <Sparkles size={18} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: '1rem' }}>AI Studio</h3>
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, background: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: 9999, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {bookings.length} loaded
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowAiModal(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: '8px 0' }}>
              <ItineraryOnboarding
                trip={trip}
                initialBookings={bookings}
                initialDependencies={dependencies}
                onItineraryConfirmed={handleBatchImport}
              />
            </div>
          </div>
        </div>
      )}

      {/* Custom User-Friendly Pop-up Modal (Replaces browser prompt) */}
      {editFieldModal && (
        <div className="modal-overlay" onClick={() => setEditFieldModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, borderRadius: 16 }}>
            <div className="modal-header" style={{ paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editFieldModal.icon && (
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: editFieldModal.bg || '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <editFieldModal.icon size={20} color={editFieldModal.iconColor || '#2563EB'} />
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{editFieldModal.title}</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{editFieldModal.subtitle}</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setEditFieldModal(null)}><X size={18} /></button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{editFieldModal.label}</label>
                <input
                  type="text"
                  className="form-input"
                  value={fieldInputValue}
                  onChange={e => setFieldInputValue(e.target.value)}
                  placeholder={editFieldModal.placeholder}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveFieldInput();
                  }}
                  style={{ fontSize: '0.9375rem', fontWeight: 600, paddingLeft: 14 }}
                />
              </div>

              {editFieldModal.suggestions && editFieldModal.suggestions.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>
                    Quick suggestions:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {editFieldModal.suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFieldInputValue(sug)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          borderRadius: 9999,
                          background: fieldInputValue === sug ? editFieldModal.iconColor || 'var(--accent)' : '#F3F4F6',
                          color: fieldInputValue === sug ? '#FFFFFF' : '#374151',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditFieldModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveFieldInput} disabled={!fieldInputValue.trim()}>
                Save &amp; Enable Live Tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
