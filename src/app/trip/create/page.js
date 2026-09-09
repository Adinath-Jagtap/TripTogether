'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import { MapPin, Calendar, DollarSign, Copy, Check, ArrowRight, ArrowLeft, Upload, Mic, Sparkles, FileText, X } from 'lucide-react';
import { generateInviteCode } from '@/lib/utils';
import ItineraryOnboarding from '@/components/itinerary/onboarding/ItineraryOnboarding';
import styles from './page.module.css';

function CreateTripContent() {
  const { user, supabase, loginAsDemo } = useAuth();
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

  const [form, setForm] = useState({
    title: '', destination: '', country: '', description: '', cover_image: '',
    start_date: '', end_date: '', budget: '', currency: 'INR',
  });

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleLoadTokyoSample = () => {
    const start = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10);

    setForm({
      title: 'Tokyo Cherry Blossom & Mount Fuji Odyssey',
      destination: 'Tokyo & Kyoto',
      country: 'Japan',
      description: '10-Day high-resilience group exploration across Shinjuku, Shibuya, Kyoto bullet train, Lake Ashi, and Mount Fuji.',
      cover_image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26',
      start_date: start,
      end_date: end,
      budget: '165000',
      currency: 'INR',
    });

    const sampleBookings = [
      {
        temp_id: 'sample-b1',
        type: 'flight',
        title: 'ANA NH830: Mumbai to Tokyo Haneda',
        start_datetime: `${start}T08:00:00.000Z`,
        end_datetime: `${start}T17:30:00.000Z`,
        origin_location: 'Mumbai (BOM)',
        destination_location: 'Tokyo Haneda (HND)',
        cost: 46000,
        vendor: 'All Nippon Airways',
        confirmation_number: 'ANA-NH830-491',
        day_number: 1,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b2',
        type: 'transfer',
        title: 'Haneda Airport Limousine Bus to Shinjuku',
        start_datetime: `${start}T19:00:00.000Z`,
        end_datetime: `${start}T20:15:00.000Z`,
        origin_location: 'Haneda Airport Terminal 3',
        destination_location: 'Shinjuku Expressway Bus Terminal',
        cost: 2400,
        vendor: 'Airport Transport Service',
        day_number: 1,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b3',
        type: 'hotel',
        title: 'Hotel Gracery Shinjuku (Godzilla Tower)',
        start_datetime: `${start}T21:00:00.000Z`,
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 36000000).toISOString(),
        venue: 'Kabukicho, Tokyo',
        cost: 38000,
        cancellation_policy: 'Free cancellation up to 48h',
        vendor: 'Gracery Hospitality Group',
        day_number: 1,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b4',
        type: 'activity',
        title: 'Shibuya Sky 360 Observatory & Meiji Shrine Walk',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 1 + 36000000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 1 + 54000000).toISOString(),
        venue: 'Shibuya Scramble Square Rooftop',
        cost: 3600,
        vendor: 'Tokyo Metropolitan Tours',
        day_number: 2,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b5',
        type: 'activity',
        title: 'TeamLab Planets Immersive Digital Art & Tsukiji Market',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 2 + 34200000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 2 + 50400000).toISOString(),
        venue: 'Toyosu teamLab Planets',
        cost: 4800,
        vendor: 'teamLab Tokyo',
        day_number: 3,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b6',
        type: 'train',
        title: 'Tokaido Shinkansen Nozomi Bullet Train: Tokyo to Kyoto',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 41400000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 50400000).toISOString(),
        origin_location: 'Tokyo Central Station',
        destination_location: 'Kyoto Main Station',
        cost: 11200,
        vendor: 'JR Central Shinkansen',
        day_number: 4,
        status: 'at_risk',
        risk_level: 'high',
        risk_reason: 'Typhoon rainstorm warning: JR Central reports 180-min speed restrictions between Shin-Yokohama and Nagoya.',
      },
      {
        temp_id: 'sample-b7',
        type: 'hotel',
        title: 'Kyoto Traditional Machiya Ryokan Gion Stay',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 3 + 54000000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 6 + 36000000).toISOString(),
        venue: 'Gion District, Kyoto',
        cost: 42000,
        vendor: 'Kyoto Ryokan Preservation Trust',
        day_number: 4,
        status: 'confirmed',
        risk_level: 'medium',
      },
      {
        temp_id: 'sample-b8',
        type: 'activity',
        title: 'Fushimi Inari 10,000 Torii Gates & Arashiyama Bamboo Walk',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 4 + 32400000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 4 + 55800000).toISOString(),
        venue: 'Fushimi Inari Taisha',
        cost: 2800,
        vendor: 'Kyoto Cultural Heritage Expeditions',
        day_number: 5,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b9',
        type: 'activity',
        title: 'Gion Tea Ceremony & Traditional Kaiseki Banquet',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 5 + 61200000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 5 + 75600000).toISOString(),
        venue: 'Gion Chaya Tea House, Kyoto',
        cost: 16000,
        vendor: 'Kyoto Artisan Culinary Guild',
        day_number: 6,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b10',
        type: 'hotel',
        title: 'Mount Fuji Onsen & Ryokan Resort (Lake Kawaguchiko)',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 6 + 54000000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 8 + 36000000).toISOString(),
        venue: 'Lake Kawaguchiko Onsen Village',
        cost: 28000,
        vendor: 'Fuji Onsen Resorts',
        day_number: 7,
        status: 'confirmed',
        risk_level: 'low',
      },
      {
        temp_id: 'sample-b11',
        type: 'activity',
        title: 'Mount Fuji 5th Station & Lake Ashi Scenic Cruise',
        start_datetime: new Date(new Date(start).getTime() + 86400000 * 7 + 32400000).toISOString(),
        end_datetime: new Date(new Date(start).getTime() + 86400000 * 7 + 57600000).toISOString(),
        venue: 'Hakone Lake Ashi',
        cost: 6500,
        vendor: 'Hakone Sightseeing Cruise',
        day_number: 8,
        status: 'confirmed',
        risk_level: 'low',
      }
    ];

    const sampleDependencies = [
      { upstream_temp_id: 'sample-b1', downstream_temp_id: 'sample-b2', buffer_minutes: 90, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b2', downstream_temp_id: 'sample-b3', buffer_minutes: 45, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b3', downstream_temp_id: 'sample-b4', buffer_minutes: 120, dependency_type: 'buffer' },
      { upstream_temp_id: 'sample-b4', downstream_temp_id: 'sample-b5', buffer_minutes: 180, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b3', downstream_temp_id: 'sample-b6', buffer_minutes: 90, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b6', downstream_temp_id: 'sample-b7', buffer_minutes: 60, dependency_type: 'sequential' },
      { upstream_temp_id: 'sample-b7', downstream_temp_id: 'sample-b8', buffer_minutes: 90, dependency_type: 'buffer' },
      { upstream_temp_id: 'sample-b7', downstream_temp_id: 'sample-b10', buffer_minutes: 120, dependency_type: 'sequential' }
    ];

    setPendingBookings(sampleBookings);
    setPendingDependencies(sampleDependencies);
    setCanvasVerified(false);
    setShowAiModal(true);
    toast.info('Sample Tokyo Odyssey loaded! Review canvas and give your Pass Check to confirm.');
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sample') === 'tokyo') {
      handleLoadTokyoSample();
    }
  }, []);

  const handleTripDataSuggested = (suggested) => {
    setForm(prev => ({
      ...prev,
      title: suggested.suggested_title || suggested.title || prev.title,
      destination: suggested.destination || prev.destination,
      country: suggested.country || prev.country || 'India',
      start_date: suggested.start_date || prev.start_date,
      end_date: suggested.end_date || prev.end_date,
      currency: suggested.currency || prev.currency || 'INR',
      budget: suggested.budget ? String(suggested.budget) : (prev.budget || '50000'),
    }));
  };

  const handleItineraryConfirmed = (bookings, deps) => {
    setPendingBookings(bookings);
    setPendingDependencies(deps || []);
    setCanvasVerified(true);
    setShowAiModal(false);
    toast.success(`✓ Canvas pass check verified! Confirmed ${bookings.length} bookings for your trip.`);
  };



  const handleCreateTrip = async () => {
    let currentUser = user;
    if (!currentUser) {
      if (typeof loginAsDemo === 'function') {
        loginAsDemo();
      }
      currentUser = {
        id: 'd0000000-0000-0000-0000-000000000001',
        email: 'demo@triptogether.app',
      };
    }

    if (!form.title || !form.destination || !form.start_date || !form.end_date || !form.budget) {
      toast.error('Please fill in all required fields (title, destination, dates, budget)');
      return;
    }

    setLoading(true);
    const code = generateInviteCode();

    try {
      let createdTripId = null;

      // 1. Attempt Supabase insert
      try {
        const { data, error } = await supabase.from('trips').insert({
          owner_id: currentUser.id,
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
        }).select().single();

        if (error) {
          console.warn('Supabase trips insert warning, falling back to local resilience store:', error.message);
        } else if (data?.id) {
          createdTripId = data.id;

          // Add owner as member
          try {
            await supabase.from('trip_members').insert({
              trip_id: data.id,
              user_id: currentUser.id,
              role: 'owner',
            });
          } catch (_) {}

          // Insert any pending AI-extracted bookings
          if (pendingBookings.length > 0) {
            const tempToDbId = {};
            for (const b of pendingBookings) {
              try {
                const { data: bData } = await supabase.from('bookings').insert({
                  trip_id: data.id,
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
                  status: 'confirmed',
                  risk_level: 'low',
                }).select().single();

                if (bData && b.temp_id) {
                  tempToDbId[b.temp_id] = bData.id;
                }
              } catch (bErr) {
                console.warn('Booking insert warning:', bErr.message);
              }
            }

            // Insert dependencies
            for (const d of pendingDependencies) {
              const upId = tempToDbId[d.upstream_temp_id];
              const downId = tempToDbId[d.downstream_temp_id];
              if (upId && downId) {
                try {
                  await supabase.from('booking_dependencies').insert({
                    trip_id: data.id,
                    upstream_booking_id: upId,
                    downstream_booking_id: downId,
                    buffer_minutes: d.buffer_minutes || 60,
                    dependency_type: d.dependency_type || 'sequential',
                  });
                } catch (_) {}
              }
            }
          }
        }
      } catch (dbErr) {
        console.warn('Supabase insert connection error, using local fallback:', dbErr);
      }

      // If DB insert failed or was blocked by RLS, ensure seamless local creation with valid UUID
      if (!createdTripId) {
        createdTripId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : 'c0000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');
      }

      // Persist in localStorage for instant offline resilience and immediate navigation
      if (typeof window !== 'undefined') {
        const existingTrips = JSON.parse(localStorage.getItem('user_trips') || '[]');
        const tripObj = {
          id: createdTripId,
          owner_id: currentUser.id,
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
          created_at: new Date().toISOString()
        };
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
      <main className="container" style={{ flex: 1, paddingTop: 40, paddingBottom: 80 }}>
        <div className={styles.wrapper}>
          <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Create a Trip</h1>
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginBottom: 32 }}>Set up your group adventure</p>

          {/* Stepper */}
          <div className="stepper">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="step-item">
                <div className={`step-dot ${step > s ? 'step-dot-done' : step === s ? 'step-dot-active' : ''}`}>
                  {step > s ? '✓' : s}
                </div>
                {i < 2 && <div className={`step-line ${step > s ? 'step-line-active' : ''}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Destination */}
          {step === 1 && (
            <div className={styles.stepContent}>
              {/* AI Studio & PDF Import Banner */}
              <div
                className={styles.pdfQuickUpload}
                onClick={() => setShowAiModal(true)}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.pdfQuickIcon}>
                  <Sparkles size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                    Drop Itinerary or Tour Brochure PDF Here
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Open AI Studio to upload PDF or dictate schedule — automatically populates title, dates, budget &amp; interactive canvas
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAiModal(true);
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    title="Open AI Studio with live canvas and PDF parsing"
                  >
                    <Sparkles size={14} />
                    <span>AI Studio</span>
                  </button>
                </div>
              </div>

              {/* Predefined Sample Itinerary Quick Action */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(235, 94, 40, 0.05) 0%, rgba(254, 243, 199, 0.45) 100%)',
                  border: '1px dashed rgba(235, 94, 40, 0.35)',
                  marginBottom: 20,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkles size={18} color="var(--accent)" />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Don&apos;t have an itinerary PDF on hand?
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      Click to load our pre-configured Tokyo Odyssey sample to test the interactive canvas verification instantly.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadTokyoSample}
                  className="btn btn-secondary btn-sm"
                  style={{
                    background: '#FFFFFF',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                    fontWeight: 600,
                  }}
                >
                  <Sparkles size={14} color="var(--accent)" />
                  <span>Use Sample Itinerary (Tokyo Odyssey)</span>
                </button>
              </div>

              {pendingBookings.length > 0 && (
                canvasVerified ? (
                  <div className={styles.extractedBadge}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={16} color="#059669" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#065F46', fontSize: '0.875rem' }}>
                          ✓ Canvas Passed Check &amp; Verified ({pendingBookings.length} bookings confirmed)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: 1 }}>
                          {form.destination || 'Destination'} • {form.start_date || 'Start'} to {form.end_date || 'End'} • ₹{form.budget || 'Budget'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAiModal(true)}
                      className="btn btn-secondary btn-sm"
                      style={{ borderColor: '#A7F3D0', background: '#FFFFFF', color: '#065F46' }}
                    >
                      <Sparkles size={14} color="#059669" />
                      <span>Inspect Canvas</span>
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '14px 18px',
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 'var(--radius-lg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Sparkles size={16} color="#D97706" />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#92400E', fontSize: '0.875rem' }}>
                          ⏳ Canvas Pass Check Required ({pendingBookings.length} bookings extracted)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: 1 }}>
                          Review the extracted itinerary graph and give your pass check to confirm before creating the trip.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAiModal(true)}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#059669', borderColor: '#059669' }}
                    >
                      <Check size={14} />
                      <span>Review &amp; Pass Check</span>
                    </button>
                  </div>
                )
              )}

              <div className="form-group">
                <label className="form-label">Trip Title *</label>
                <input className="form-input" value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="Goa Group Getaway" />
              </div>
              <div className={styles.row}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Destination *</label>
                  <input className="form-input" value={form.destination} onChange={e => updateForm('destination', e.target.value)} placeholder="Goa" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Country</label>
                  <input className="form-input" value={form.country} onChange={e => updateForm('country', e.target.value)} placeholder="India" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={e => updateForm('description', e.target.value)} placeholder="A fun trip with friends..." />
              </div>
              <div className={styles.actions}>
                <div />
                <button className="btn btn-primary" onClick={() => {
                  if (!form.title || !form.destination) { toast.error('Title and destination are required'); return; }
                  setStep(2);
                }}>
                  Next <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
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
                <button className="btn btn-secondary" onClick={() => setStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="btn btn-primary" onClick={handleCreateTrip} disabled={loading}>
                  {loading ? 'Creating…' : 'Create Trip'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Invite & Go */}
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
            <div
              className="modal-content"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 940, maxHeight: '90vh', overflowY: 'auto' }}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color="var(--accent)" />
                  <h3 style={{ margin: 0 }}>AI Itinerary Studio</h3>
                </div>
                <button className="modal-close" onClick={() => setShowAiModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px 24px' }}>
                <ItineraryOnboarding
                  trip={{
                    destination: form.destination,
                    start_date: form.start_date,
                    currency: form.currency,
                  }}
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
