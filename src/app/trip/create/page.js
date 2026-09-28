'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import { Copy, Check, ArrowRight, ArrowLeft, Sparkles, X, FileUp } from 'lucide-react';
import { generateInviteCode } from '@/lib/utils';
import ItineraryOnboarding from '@/components/itinerary/onboarding/ItineraryOnboarding';
import {
  createTrip, addTripMember, addBooking, addBookingDependency,
} from '@/lib/firebase/firestore';
import { getDayNumber } from '@/lib/utils';
import styles from './page.module.css';

function TitleSuggestions({ destination, country, startDate, title, onSelect }) {
  const dest = (destination || country || '').trim();
  if (!dest) return null;

  const year = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = startDate ? monthNames[new Date(startDate).getMonth()] : '';
  const clean = dest.charAt(0).toUpperCase() + dest.slice(1);
  const suggestions = [
    `✈️ ${clean} Getaway${month ? ' (' + month + ')' : ''}`,
    `🌴 ${clean} Group Odyssey`,
    `🚀 ${clean} Adventure ${year}`,
    `✨ Explore ${clean}`,
    `🏖️ ${clean} Escapade`
  ];

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>
        <span>Click a title suggestion to apply:</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {suggestions.map((sug, idx) => {
          const rawText = sug.replace(/^[\p{Emoji}\s]+/gu, '').trim();
          const isSelected = title === rawText || title === sug;
          return (
            <button
              key={`${sug}_${idx}`}
              type="button"
              onClick={() => onSelect(rawText)}
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                borderRadius: 9999,
                background: isSelected ? 'var(--accent)' : '#F3F4F6',
                border: '1px solid ' + (isSelected ? 'var(--accent)' : '#E5E7EB'),
                color: isSelected ? '#FFFFFF' : '#374151',
                cursor: 'pointer',
                fontWeight: isSelected ? 600 : 400,
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>{sug}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateTripContent() {
  const { user, loginAsDemo } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [canvasVerified, setCanvasVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tripId, setTripId] = useState(null);
  const [inviteCode, setInviteCode] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [pendingDependencies, setPendingDependencies] = useState([]);
  const [suggestedBanner, setSuggestedBanner] = useState(null);

  const [form, setForm] = useState({
    title: '', destination: '', country: '', description: '', cover_image: '',
    start_date: '', end_date: '', budget: '', currency: 'INR',
  });

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleLoadTokyoSample = () => {
    const start = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10);
    const sampleTitle = 'Tokyo Cherry Blossom & Mount Fuji Odyssey';
    setForm({ title: sampleTitle, destination: 'Tokyo & Kyoto', country: 'Japan', description: '10-Day high-resilience group exploration.', cover_image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26', start_date: start, end_date: end, budget: '165000', currency: 'INR' });
    setSuggestedBanner({
      title: sampleTitle,
      destination: 'Tokyo & Kyoto',
      country: 'Japan',
      start_date: start,
      end_date: end,
      budget: '165000',
    });
    const sampleBookings = [
      { temp_id: 'sample-b1', type: 'flight', title: 'ANA NH830: Mumbai to Tokyo Haneda', start_datetime: `${start}T08:00:00.000Z`, end_datetime: `${start}T17:30:00.000Z`, origin_location: 'Mumbai (BOM)', destination_location: 'Tokyo Haneda (HND)', cost: 46000, vendor: 'All Nippon Airways', confirmation_number: 'ANA-NH830-491', day_number: 1, status: 'confirmed', risk_level: 'low' },
      { temp_id: 'sample-b2', type: 'transfer', title: 'Haneda Airport Limousine Bus to Shinjuku', start_datetime: `${start}T19:00:00.000Z`, end_datetime: `${start}T20:15:00.000Z`, origin_location: 'Haneda Airport Terminal 3', destination_location: 'Shinjuku Expressway Bus Terminal', cost: 2400, vendor: 'Airport Transport Service', day_number: 1, status: 'confirmed', risk_level: 'low' },
      { temp_id: 'sample-b3', type: 'hotel', title: 'Hotel Gracery Shinjuku (Godzilla Tower)', start_datetime: `${start}T21:00:00.000Z`, end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 36000000).toISOString(), venue: 'Kabukicho, Tokyo', cost: 38000, vendor: 'Gracery Hospitality Group', day_number: 1, status: 'confirmed', risk_level: 'low' },
      { temp_id: 'sample-b4', type: 'train', title: 'Tokaido Shinkansen Nozomi Bullet Train: Tokyo to Kyoto', start_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 41400000).toISOString(), end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 50400000).toISOString(), origin_location: 'Tokyo Central Station', destination_location: 'Kyoto Main Station', cost: 11200, vendor: 'JR Central', day_number: 4, status: 'at_risk', risk_level: 'high' },
    ];
    const sampleDependencies = [
      { upstream_temp_id: 'sample-b1', downstream_temp_id: 'sample-b2', buffer_minutes: 90, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b2', downstream_temp_id: 'sample-b3', buffer_minutes: 45, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b3', downstream_temp_id: 'sample-b4', buffer_minutes: 90, dependency_type: 'sequential' },
    ];
    setPendingBookings(sampleBookings);
    setPendingDependencies(sampleDependencies);
    setCanvasVerified(false);
    setShowAiModal(true);
    toast.info('Sample Tokyo Odyssey loaded!');
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sample') === 'tokyo') {
      handleLoadTokyoSample();
    }
  }, []);

  const handleTripDataSuggested = (suggested) => {
    const suggestedTitle = suggested.suggested_title || suggested.title;
    setForm(prev => ({
      ...prev,
      title: suggestedTitle || prev.title,
      destination: suggested.destination || prev.destination,
      country: suggested.country || prev.country || 'India',
      start_date: suggested.start_date || prev.start_date,
      end_date: suggested.end_date || prev.end_date,
      currency: suggested.currency || prev.currency || 'INR',
      budget: suggested.budget ? String(suggested.budget) : (prev.budget || '50000'),
    }));

    setSuggestedBanner({
      title: suggestedTitle || form.title || suggested.destination,
      destination: suggested.destination || form.destination,
      country: suggested.country || form.country || 'India',
      start_date: suggested.start_date || form.start_date,
      end_date: suggested.end_date || form.end_date,
      budget: suggested.budget ? String(suggested.budget) : form.budget,
    });

    toast.success(`✨ Suggested trip details populated for "${suggestedTitle || suggested.destination || 'your itinerary'}"!`);
  };

  const handleItineraryConfirmed = (bookings, deps) => {
    setPendingBookings(bookings);
    setPendingDependencies(deps || []);
    setCanvasVerified(true);
    setShowAiModal(false);
    toast.success(`✓ Canvas pass check verified! ${bookings.length} bookings confirmed.`);
  };

  const handleCreateTrip = async () => {
    let currentUser = user;
    if (!currentUser) {
      if (typeof loginAsDemo === 'function') loginAsDemo();
      currentUser = { uid: 'd0000000-0000-0000-0000-000000000001', id: 'd0000000-0000-0000-0000-000000000001', email: 'demo@triptogether.app' };
    }

    if (!form.title || !form.destination || !form.start_date || !form.end_date || !form.budget) {
      toast.error('Please fill in all required fields (title, destination, dates, budget)');
      return;
    }

    setLoading(true);
    const code = generateInviteCode();
    const uid = currentUser.uid || currentUser.id;

    try {
      const tripData = {
        owner_id: uid,
        title: form.title,
        destination: form.destination,
        country: form.country || 'India',
        description: form.description || '',
        cover_image: form.cover_image || '',
        start_date: form.start_date,
        end_date: form.end_date,
        budget: Number(form.budget) || 50000,
        currency: form.currency || 'INR',
        invite_code: code,
        status: 'planning',
        resilience_score: 85,
        member_ids: [uid],
      };

      let createdTripId = null;
      try {
        createdTripId = await createTrip(tripData);

        // Add owner as member
        try { await addTripMember(createdTripId, uid, { role: 'owner' }); } catch (_) {}

        // Insert pending bookings
        if (pendingBookings.length > 0) {
          const tempToDbId = {};
          for (const b of pendingBookings) {
            try {
              const saved = await addBooking(createdTripId, {
                trip_id: createdTripId,
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
                flight_number: b.flight_number || null,
                train_number: b.train_number || null,
                pnr: b.pnr || null,
                contact_phone: b.contact_phone || null,
                contact_name: b.contact_name || null,
                day_number: b.day_number || getDayNumber(form.start_date, b.start_datetime),
                status: b.status || 'confirmed',
                risk_level: b.risk_level || 'low',
              });
              if (b.temp_id) tempToDbId[b.temp_id] = saved.id;
            } catch (bErr) { console.warn('Booking insert warning:', bErr.message); }
          }

          // Insert dependencies
          for (const d of pendingDependencies) {
            const upId = tempToDbId[d.upstream_temp_id];
            const downId = tempToDbId[d.downstream_temp_id];
            if (upId && downId) {
              try {
                await addBookingDependency(createdTripId, {
                  trip_id: createdTripId,
                  upstream_booking_id: upId,
                  downstream_booking_id: downId,
                  buffer_minutes: d.buffer_minutes || 60,
                  dependency_type: d.dependency_type || 'sequential',
                });
              } catch (_) {}
            }
          }
        }
      } catch (dbErr) {
        console.warn('Firestore insert error, using local fallback:', dbErr);
      }

      // Fallback local ID if Firestore failed
      if (!createdTripId) {
        createdTripId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'c0000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');
      }

      // Persist in localStorage for offline resilience
      if (typeof window !== 'undefined') {
        const existingTrips = JSON.parse(localStorage.getItem('user_trips') || '[]');
        const tripObj = { id: createdTripId, ...tripData, created_at: new Date().toISOString() };
        localStorage.setItem('user_trips', JSON.stringify([tripObj, ...existingTrips.filter(t => t.id !== createdTripId)]));
        localStorage.setItem(`cached_trip_${createdTripId}`, JSON.stringify(tripObj));
        if (pendingBookings.length > 0) {
          localStorage.setItem(`cached_bookings_${createdTripId}`, JSON.stringify(pendingBookings));
        }
      }

      setTripId(createdTripId);
      setInviteCode(code);
      setLoading(false);
      setStep(3);
      toast.success('Trip created successfully!');
    } catch (err) {
      console.error('Fatal trip creation error:', err);
      toast.error('Failed to create trip: ' + err.message);
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main className="container" style={{ flex: 1, paddingTop: 'calc(var(--navbar-height, 56px) + 28px)', paddingBottom: 80 }}>
        <div className={styles.wrapper}>
          <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Create a Trip</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginBottom: 32 }}>Set up your group adventure</p>

          {/* Stepper */}
          <div className="stepper">
            {[{ num: 1, label: 'Details' }, { num: 2, label: 'Schedule' }, { num: 3, label: 'Done' }].map((s, i) => (
              <div key={s.num} className="step-item">
                <div className="step-dot-wrap">
                  <div className={`step-dot ${step > s.num ? 'step-dot-done' : step === s.num ? 'step-dot-active' : ''}`}>
                    {step > s.num ? '✓' : s.num}
                  </div>
                  <span className={`step-label ${step === s.num ? 'step-label-active' : step > s.num ? 'step-label-done' : ''}`}>
                    {s.label}
                  </span>
                </div>
                {i < 2 && <div className={`step-line ${step > s.num ? 'step-line-active' : ''}`} />}
              </div>
            ))}
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div className={styles.stepContent}>
              {/* 1. TOP SECTION: Quick Itinerary Import & AI Studio */}
              <div style={{ background: 'linear-gradient(135deg, #FFFDF9 0%, #FEF3C7 100%)', borderRadius: 14, padding: '16px', border: '1px solid #FCD34D' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={18} color="var(--accent)" />
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#92400E' }}>
                      ⚡ Fast Track: Upload or Dictate Itinerary First
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 500 }}>
                    Auto-fills destination &amp; title below!
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {/* Option 1: AI PDF Upload or Voice */}
                  <div
                    onClick={() => setShowAiModal(true)}
                    style={{
                      padding: '14px 16px',
                      background: '#FFFFFF',
                      border: '1.5px solid #FDE68A',
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                    className={styles.optionHoverCard}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileUp size={18} color="#B45309" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#92400E' }}>Upload PDF or Dictate</div>
                      <div style={{ fontSize: '0.75rem', color: '#B45309' }}>AI extracts details &amp; name</div>
                    </div>
                  </div>

                  {/* Option 2: Pre-configured Sample */}
                  <div
                    onClick={handleLoadTokyoSample}
                    style={{
                      padding: '14px 16px',
                      background: '#FFFFFF',
                      border: '1.5px solid #BAE6FD',
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                    className={styles.optionHoverCard}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Sparkles size={18} color="#0284C7" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0369A1' }}>Load Tokyo Sample</div>
                      <div style={{ fontSize: '0.75rem', color: '#0284C7' }}>Pre-fill 10-day trip demo</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Suggested Details AI Banner */}
              {suggestedBanner && (
                <div style={{
                  marginTop: 14,
                  padding: '14px 16px',
                  background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                  border: '1.5px solid #6EE7B7',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  gap: 12,
                  boxShadow: '0 2px 8px rgba(5, 150, 105, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={20} color="#059669" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#065F46', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>✨ Suggested Trip Details Applied</span>
                        <span style={{ fontSize: '0.6875rem', background: '#059669', color: '#FFFFFF', padding: '2px 8px', borderRadius: 9999, fontWeight: 700 }}>AI PRE-FILLED</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: 3, lineHeight: 1.4 }}>
                        Trip Name: <strong style={{ color: '#065F46' }}>{suggestedBanner.title || 'Custom Trip'}</strong> · Destination: <strong style={{ color: '#065F46' }}>{suggestedBanner.destination}</strong> ({suggestedBanner.country || 'India'})
                        {suggestedBanner.start_date && <span> · Dates: <strong style={{ color: '#065F46' }}>{suggestedBanner.start_date} to {suggestedBanner.end_date}</strong></span>}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuggestedBanner(null)}
                    style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                    title="Dismiss notification"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* 2. SECOND SECTION: Form Fields */}
              <div className={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Destination *</label>
                  <input className="form-input" value={form.destination} onChange={e => updateForm('destination', e.target.value)} placeholder="e.g. Tokyo, Goa, Paris" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Country</label>
                  <input className="form-input" value={form.country} onChange={e => updateForm('country', e.target.value)} placeholder="e.g. Japan, India" />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ margin: 0 }}>Trip Title *</label>
                  {form.destination && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>
                      ✨ Suggested for &quot;{form.destination}&quot;
                    </span>
                  )}
                </div>
                <input className="form-input" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="e.g. Tokyo Cherry Blossom Odyssey" />

                {/* Derived Title Suggestions Chips */}
                <TitleSuggestions
                  destination={form.destination}
                  country={form.country}
                  startDate={form.start_date}
                  title={form.title}
                  onSelect={(rawText) => updateForm('title', rawText)}
                />
              </div>

              {pendingBookings.length > 0 && canvasVerified && (
                <div className={styles.extractedBadge}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={14} color="#059669" /></div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#065F46', fontSize: '0.8125rem' }}>✓ Itinerary Loaded ({pendingBookings.length} bookings ready)</div>
                      <div style={{ fontSize: '0.75rem', color: '#047857' }}>{form.destination || 'Destination'} · {form.start_date || 'Start'} to {form.end_date || 'End'}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowAiModal(true)} className="btn btn-secondary btn-sm" style={{ borderColor: '#A7F3D0', background: '#FFFFFF', color: '#065F46' }}>
                    <Sparkles size={14} color="#059669" /><span>Inspect Itinerary</span>
                  </button>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={e => updateForm('description', e.target.value)} placeholder="A fun trip with friends..." />
              </div>
              <div className={styles.actions}>
                <div />
                <button className="btn btn-primary" onClick={() => { if (!form.title || !form.destination) { toast.error('Title and destination are required'); return; } setStep(2); }}>
                  <span>Next</span> <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <div className={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={e => updateForm('start_date', e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-input" value={form.end_date} onChange={e => updateForm('end_date', e.target.value)} />
                </div>
              </div>
              <div className={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Budget *</label>
                  <input type="number" className="form-input" value={form.budget} onChange={e => updateForm('budget', e.target.value)} placeholder="80000" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Currency</label>
                  <select className="form-input form-select" value={form.currency} onChange={e => updateForm('currency', e.target.value)}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>
              <div className={styles.actions}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
                <button className="btn btn-primary" onClick={handleCreateTrip} disabled={loading}>
                  {loading ? 'Creating…' : 'Create Trip'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className={styles.stepContent} style={{ textAlign: 'center' }}>
              <div className={styles.successIcon}>🎉</div>
              <h2>Your trip is ready!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Share this invite code with your group</p>
              <div className={styles.codeBox}>
                <span className={styles.code}>{inviteCode}</span>
                <button className="btn btn-secondary btn-sm" onClick={copyCode}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <button className="btn btn-primary btn-lg" onClick={() => router.push(`/trip/${tripId}`)}>
                  Go to Trip <ArrowRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AI Studio Modal */}
        {showAiModal && (
          <div className="modal-overlay" onClick={() => setShowAiModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 940, maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color="var(--accent)" />
                  <h3 style={{ margin: 0 }}>AI Itinerary Studio</h3>
                </div>
                <button className="modal-close" onClick={() => setShowAiModal(false)}><X size={18} /></button>
              </div>
              <div style={{ padding: '16px 24px' }}>
                <ItineraryOnboarding
                  trip={{ destination: form.destination, start_date: form.start_date, currency: form.currency }}
                  initialBookings={pendingBookings}
                  initialDependencies={pendingDependencies}
                  onTripDataSuggested={handleTripDataSuggested}
                  onItineraryConfirmed={handleItineraryConfirmed}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CreateTripPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <CreateTripContent />
      </ToastProvider>
    </AuthProvider>
  );
}
