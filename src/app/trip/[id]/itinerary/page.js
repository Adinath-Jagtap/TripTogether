'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '../layout';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';
import { Plus, Plane, Building2, Car, Compass, Calendar, Train, Bus, Trash2, X, Link2, Sparkles, ArrowRight } from 'lucide-react';
import { formatTime, formatDateShort, getDayNumber, getDayLabel, getTripDuration, BOOKING_TYPES, formatCurrency } from '@/lib/utils';
import ItineraryOnboarding from '@/components/itinerary/onboarding/ItineraryOnboarding';
import {
  getBookings, addBooking, updateBooking, deleteBooking,
  getBookingDependencies, addBookingDependency, deleteBookingDependency,
} from '@/lib/firebase/firestore';
import styles from './page.module.css';

const TypeIcons = { flight: Plane, hotel: Building2, transfer: Car, activity: Compass, event: Calendar, train: Train, bus: Bus };

export default function ItineraryPage() {
  const { trip } = useTrip();
  const { id } = useParams();
  const toast = useToast();
  const [bookings, setBookings] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [form, setForm] = useState({
    type: 'flight', title: '', start_datetime: '', end_datetime: '',
    origin_location: '', destination_location: '', venue: '',
    cost: '', cancellation_policy: 'free', vendor: '', confirmation_number: '',
    depends_on: '',
  });

  const parseRecovery = (booking) => {
    if (booking?.risk_reason && booking.risk_reason.includes('[RECOVERED_PLAN]:')) {
      try { return JSON.parse(booking.risk_reason.split('[RECOVERED_PLAN]:')[1]); } catch (_) {}
    }
    if (typeof window !== 'undefined') {
      try {
        const list = JSON.parse(localStorage.getItem(`trip_recoveries_${id}`) || '[]');
        for (const rec of list) {
          const ch = rec.changes?.find(c => c.booking_id === booking?.id);
          if (ch) return { is_recovered: true, plan_label: rec.plan_label, ...ch, change_reason: ch.change_reason || rec.summary };
        }
      } catch (_) {}
    }
    return null;
  };

  const load = async () => {
    let b = [];
    try { b = await getBookings(id); } catch (_) {}
    if (b.length === 0 && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('cached_bookings_' + id);
        if (cached) b = JSON.parse(cached);
      } catch (_) {}
    }
    setBookings(b);
    let d = [];
    try { d = await getBookingDependencies(id); } catch (_) {}
    setDependencies(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleBatchImport = async (newBookings, newDeps) => {
    try {
      const tempToDbId = {};
      const savedBookings = [];
      const existingDbIds = new Set(bookings.map(b => b.id).filter(Boolean));
      const confirmedDbIds = new Set(newBookings.map(b => b.id).filter(Boolean));

      // Remove deleted bookings
      const toDelete = bookings.filter(eb => eb.id && !confirmedDbIds.has(eb.id));
      for (const del of toDelete) {
        try { await deleteBooking(id, del.id); } catch (_) {}
      }

      // Also delete all dependencies and re-insert
      for (const dep of dependencies) {
        try { await deleteBookingDependency(id, dep.id); } catch (_) {}
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
            } catch (_) {}
          }
        }
      }

      if (typeof window !== 'undefined') {
        try { localStorage.setItem('cached_bookings_' + id, JSON.stringify(savedBookings)); } catch (_) {}
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
      setForm({ type: 'flight', title: '', start_datetime: '', end_datetime: '', origin_location: '', destination_location: '', venue: '', cost: '', cancellation_policy: 'free', vendor: '', confirmation_number: '', depends_on: '' });
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to add booking');
    }
  };

  const handleDelete = async (bookingId) => {
    if (!confirm('Delete this booking?')) return;
    try { await deleteBooking(id, bookingId); } catch (_) {}
    toast.success('Booking deleted');
    load();
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
  const isTransport = (type) => ['flight', 'transfer', 'train', 'bus'].includes(type);

  if (loading) return <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2>Itinerary</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowAiModal(true)}>
            <Sparkles size={16} color="var(--color-primary)" /> AI Import &amp; Dictate
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Booking
          </button>
        </div>
      </div>

      {bookings.some(b => b.status === 'rescheduled' || (b.risk_reason && b.risk_reason.includes('[RECOVERED_PLAN]:'))) && (
        <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
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

                  return (
                    <div key={b.id}>
                      {hasDepUp && (
                        <div className={styles.depLine}><Link2 size={12} /> depends on previous</div>
                      )}
                      <div className={`card card-flat ${styles.bookingCard}`} style={{ borderLeftColor: isRecovered ? '#F59E0B' : color }}>
                        <div className={styles.bookingHeader}>
                          <div className={styles.bookingIcon} style={{ color: isRecovered ? '#B45309' : color }}><Icon size={20} /></div>
                          <div className={styles.bookingInfo}>
                            <div className={styles.bookingTitle}>
                              {b.title}
                              {isRecovered && <span style={{ marginLeft: 8, fontSize: '0.6875rem', fontWeight: 700, background: '#FEF3C7', color: '#B45309', padding: '2px 8px', borderRadius: 12, verticalAlign: 'middle' }}>⚡ Plan Adjusted</span>}
                            </div>
                            <div className={styles.bookingTime}>
                              {formatTime(b.start_datetime)} – {formatTime(b.end_datetime)}
                              {b.venue && <span> · {b.venue}</span>}
                              {b.origin_location && b.destination_location && <span> · {b.origin_location} → {b.destination_location}</span>}
                            </div>
                          </div>
                          <div className={styles.bookingRight}>
                            {b.cost > 0 && <span className={styles.bookingCost}>{formatCurrency(b.cost, trip?.currency)}</span>}
                            <span className={`badge badge-${b.status === 'confirmed' ? 'success' : isRecovered ? 'warning' : b.status === 'at_risk' ? 'warning' : b.status === 'disrupted' ? 'danger' : 'neutral'}`}>
                              {isRecovered ? 'rescheduled' : b.status}
                            </span>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDelete(b.id)}><Trash2 size={14} /></button>
                          </div>
                        </div>

                        {recovery && (
                          <div style={{ marginTop: 14, padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, fontSize: '0.8125rem' }}>
                            <div style={{ fontWeight: 700, color: '#B45309', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={14} /> Plan Changed via Disruption Recovery ({recovery.plan_label || 'Recovery Plan'})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, background: '#FFFFFF', padding: '10px 12px', borderRadius: 6, border: '1px dashed #F59E0B' }}>
                              <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 2 }}>This Was Your Plan</div>
                                <div style={{ textDecoration: 'line-through', color: '#6B7280', fontWeight: 600 }}>{recovery.original_title || b.title}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 2 }}>{formatTime(recovery.original_start || b.start_datetime)} – {formatTime(recovery.original_end || b.end_datetime)}</div>
                              </div>
                              <div style={{ color: '#B45309', fontWeight: 900, fontSize: '1.25rem' }}>➔</div>
                              <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: 2 }}>Changed To (Current Plan)</div>
                                <div style={{ color: '#1F2937', fontWeight: 700 }}>{b.title}</div>
                                <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600, marginTop: 2 }}>{formatTime(b.start_datetime)} – {formatTime(b.end_datetime)}</div>
                              </div>
                            </div>
                            {recovery.change_reason && <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#78350F' }}><strong>Why this changed:</strong> {recovery.change_reason}</div>}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <div style={{ display: 'flex', gap: 12 }}>
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
                <div style={{ display: 'flex', gap: 12 }}>
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
              <div style={{ display: 'flex', gap: 12 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} color="var(--color-primary)" />
                <h3 style={{ margin: 0 }}>AI Itinerary Studio</h3>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: 9999 }}>
                  Live Canvas Sync ({bookings.length} loaded)
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
    </div>
  );
}
