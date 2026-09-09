'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Plus, MapPin, Calendar, Users, Clock, Shield, KeyRound, X } from 'lucide-react';
import { formatDateRange, formatCurrency, getInitials, getAvatarColor, getResilienceColor } from '@/lib/utils';
import styles from './page.module.css';

function DashboardContent() {
  const router = useRouter();
  const toast = useToast();
  const { user, supabase, loading: authLoading } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user && !authLoading) {
      setLoading(false);
      return;
    }
    if (!user) return;

    const fetchTrips = async () => {
      try {
        // Allow URL ?reset=1 or localStorage clear to reset all locally staged trips
        if (typeof window !== 'undefined' && window.location.search.includes('reset=1')) {
          localStorage.removeItem('user_trips');
          window.history.replaceState({}, '', '/dashboard');
        }

        const demoUserId = 'd0000000-0000-0000-0000-000000000001';
        const userIdsToQuery = Array.from(new Set([user.id, (user.email?.includes('demo') ? demoUserId : null)].filter(Boolean)));

        // 1. Get trips where user is owner
        let ownedTrips = [];
        const { data: ot } = await supabase
          .from('trips')
          .select('*')
          .in('owner_id', userIdsToQuery);
        if (ot) ownedTrips = ot;

        // 2. Get trips where user is a member
        const { data: memberTrips } = await supabase
          .from('trip_members')
          .select('trip_id')
          .in('user_id', userIdsToQuery);

        const tripIds = memberTrips?.map(m => m.trip_id) || [];
        let joinedTrips = [];
        if (tripIds.length > 0) {
          const { data: joined } = await supabase
            .from('trips')
            .select('*')
            .in('id', tripIds);
          if (joined) joinedTrips = joined;
        }

        // 3. Retrieve any locally saved trips from localStorage
        let localTrips = [];
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem('user_trips');
            if (stored) localTrips = JSON.parse(stored);
          } catch (_) {}
        }

        // 4. Combine and deduplicate only real/created trips by id
        const tripMap = new Map();

        // Add database trips
        ownedTrips.forEach(t => tripMap.set(t.id, t));
        joinedTrips.forEach(t => tripMap.set(t.id, t));

        // Add any local storage trips (merging details)
        localTrips.forEach(t => {
          if (!tripMap.has(t.id)) {
            tripMap.set(t.id, t);
          } else {
            tripMap.set(t.id, { ...tripMap.get(t.id), ...t });
          }
        });

        const allTrips = Array.from(tripMap.values());

        // For each trip, safely get member count without crashing on non-UUID
        for (const trip of allTrips) {
          try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trip.id);
            if (isUuid) {
              const { count } = await supabase
                .from('trip_members')
                .select('*', { count: 'exact', head: true })
                .eq('trip_id', trip.id);
              trip.memberCount = (count && count > 0) ? count : 1;
            } else {
              trip.memberCount = 1;
            }
          } catch (_) {
            trip.memberCount = 1;
          }
        }

        // Sort newest trips first
        allTrips.sort((a, b) => new Date(b.created_at || b.start_date || 0) - new Date(a.created_at || a.start_date || 0));
        setTrips(allTrips);
      } catch (err) {
        console.error('Error fetching dashboard trips:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, [user, authLoading]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code') || params.get('join');
      if (codeParam) {
        setInviteCode(codeParam.toUpperCase());
        setShowJoinModal(true);
      }
    }
  }, []);

  const handleJoinTrip = async (e) => {
    e?.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) {
      toast.error('Please enter an invite code.');
      return;
    }

    setJoining(true);
    try {
      // 1. Search in Supabase trips table by invite_code
      let foundTrip = null;
      const { data } = await supabase
        .from('trips')
        .select('*')
        .ilike('invite_code', cleanCode)
        .maybeSingle();

      if (data) {
        foundTrip = data;
      } else {
        // Fallback check: if code is TOKYO26 or similar, find by title or code
        if (cleanCode === 'TOKYO26') {
          const { data: tokyoTrip } = await supabase
            .from('trips')
            .select('*')
            .ilike('title', '%tokyo%')
            .maybeSingle();
          if (tokyoTrip) foundTrip = tokyoTrip;
        }

        // Also check localStorage user_trips
        if (!foundTrip && typeof window !== 'undefined') {
          try {
            const stored = JSON.parse(localStorage.getItem('user_trips') || '[]');
            const match = stored.find(t => (t.invite_code || '').toUpperCase() === cleanCode);
            if (match) foundTrip = match;
          } catch (_) {}
        }
      }

      if (!foundTrip) {
        toast.error(`No trip found for code "${cleanCode}". Please verify and try again.`);
        setJoining(false);
        return;
      }

      // 2. Add user to trip_members if authenticated
      if (user && !user.email?.includes('demo')) {
        try {
          await supabase.from('trip_members').upsert({
            trip_id: foundTrip.id,
            user_id: user.id,
            role: 'member',
          }, { onConflict: 'trip_id,user_id' });
        } catch (_) {}
      }

      // 3. Stash in localStorage user_trips so it persists locally
      if (typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(localStorage.getItem('user_trips') || '[]');
          if (!stored.some(t => t.id === foundTrip.id)) {
            stored.unshift(foundTrip);
            localStorage.setItem('user_trips', JSON.stringify(stored));
          }
        } catch (_) {}
      }

      toast.success(`Joined "${foundTrip.title}" successfully!`);
      setShowJoinModal(false);
      setJoining(false);
      router.push(`/trip/${foundTrip.id}`);
    } catch (err) {
      console.error('Error joining trip:', err);
      toast.error('Failed to join trip. Please try again.');
      setJoining(false);
    }
  };

  const handleClearTrips = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_trips');
      setTrips([]);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.wrapper}>
        <Navbar />
        <div className="container" style={{ paddingTop: 40 }}>
          <div className={styles.grid}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 12 }} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <Navbar />
      <main className="container" style={{ width: '100%', flex: 1, paddingTop: 40, paddingBottom: 80 }}>
        <div className={styles.header}>
          <div>
            <h1>Your Trips</h1>
            <p style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
              {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="btn btn-secondary"
            >
              <KeyRound size={16} /> Join Trip
            </button>
            <Link href="/trip/create" className="btn btn-primary">
              <Plus size={18} /> New Trip
            </Link>
          </div>
        </div>

        {trips.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><MapPin size={48} /></div>
            <h3>No trips yet</h3>
            <p>Upload a tour brochure PDF, build with voice AI, or plan your next destination.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <Link href="/trip/create" className="btn btn-primary">
                <Plus size={18} /> Create Trip
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.grid}>
            {trips.map(trip => (
              <Link key={trip.id} href={`/trip/${trip.id}`} className={`card ${styles.tripCard}`}>
                <div className={styles.tripTop}>
                  <span className={`badge ${trip.status === 'active' ? 'badge-success' : trip.status === 'completed' ? 'badge-neutral' : 'badge-accent'}`}>
                    {trip.status}
                  </span>
                  <div className={styles.resilience} style={{ color: getResilienceColor(trip.resilience_score || 85) }}>
                    <Shield size={14} /> {trip.resilience_score || 85}
                  </div>
                </div>
                <h3 className={styles.tripTitle}>{trip.title}</h3>
                <div className={styles.tripMeta}>
                  <span><MapPin size={14} /> {trip.destination}</span>
                  <span><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
                </div>
                <div className={styles.tripBottom}>
                  <div className={styles.tripMembers}>
                    <Users size={14} /> {trip.memberCount} members
                  </div>
                  <span className={styles.tripBudget}>{formatCurrency(trip.budget, trip.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {showJoinModal && (
          <div className={styles.modalOverlay} onClick={() => !joining && setShowJoinModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2><KeyRound size={20} color="var(--accent)" /> Join a Trip</h2>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => !joining && setShowJoinModal(false)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleJoinTrip} className={styles.modalBody}>
                <p className={styles.modalDesc}>
                  Enter the invite code (e.g. <strong>TOKYO26</strong>) shared by your trip organizer to access the itinerary, group budget, and live disruption alerts.
                </p>
                <input
                  type="text"
                  className={styles.codeInput}
                  placeholder="ENTER CODE"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={12}
                  autoFocus
                  disabled={joining}
                />
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setShowJoinModal(false)}
                    disabled={joining}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={joining || !inviteCode.trim()}
                  >
                    {joining ? 'Joining...' : 'Join Trip'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <DashboardContent />
      </ToastProvider>
    </AuthProvider>
  );
}
