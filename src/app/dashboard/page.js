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
import {
  getUserTrips, getTripsByMembership, getTrip, getMemberCount,
  getTripByInviteCode, addTripMember,
} from '@/lib/firebase/firestore';
import styles from './page.module.css';

function DashboardContent() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
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
        if (typeof window !== 'undefined' && window.location.search.includes('reset=1')) {
          localStorage.removeItem('user_trips');
          window.history.replaceState({}, '', '/dashboard');
        }

        const uid = user.uid || user.id;

        // 1. Get trips where user is owner
        let ownedTrips = [];
        try { ownedTrips = await getUserTrips(uid); } catch (_) {}

        // 2. Get trips where user is a member (via member_ids array field)
        let memberTrips = [];
        try { memberTrips = await getTripsByMembership(uid); } catch (_) {}

        // 3. Retrieve locally saved trips
        let localTrips = [];
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem('user_trips');
            if (stored) localTrips = JSON.parse(stored);
          } catch (_) {}
        }

        // 4. Combine and deduplicate
        const tripMap = new Map();
        ownedTrips.forEach(t => tripMap.set(t.id, t));
        memberTrips.forEach(t => { if (!tripMap.has(t.id)) tripMap.set(t.id, t); });
        localTrips.forEach(t => {
          if (!tripMap.has(t.id)) tripMap.set(t.id, t);
          else tripMap.set(t.id, { ...tripMap.get(t.id), ...t });
        });

        const allTrips = Array.from(tripMap.values());

        // 5. Get member counts
        for (const trip of allTrips) {
          try {
            const count = await getMemberCount(trip.id);
            trip.memberCount = count > 0 ? count : 1;
          } catch (_) {
            trip.memberCount = 1;
          }
        }

        allTrips.sort((a, b) => new Date(b.created_at?.seconds ? b.created_at.seconds * 1000 : b.created_at || 0) - new Date(a.created_at?.seconds ? a.created_at.seconds * 1000 : a.created_at || 0));
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
    if (!cleanCode) { toast.error('Please enter an invite code.'); return; }

    setJoining(true);
    try {
      let foundTrip = null;

      // 1. Search Firestore by invite_code
      try { foundTrip = await getTripByInviteCode(cleanCode); } catch (_) {}

      // 2. Fallback to localStorage
      if (!foundTrip && typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(localStorage.getItem('user_trips') || '[]');
          const match = stored.find(t => (t.invite_code || '').toUpperCase() === cleanCode);
          if (match) foundTrip = match;
        } catch (_) {}
      }

      if (!foundTrip) {
        toast.error(`No trip found for code "${cleanCode}". Please verify and try again.`);
        setJoining(false);
        return;
      }

      // 3. Add user as member in Firestore
      const uid = user?.uid || user?.id;
      if (uid && !user?.email?.includes('demo')) {
        try {
          await addTripMember(foundTrip.id, uid, { role: 'member' });
        } catch (_) {}
      }

      // 4. Persist locally
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

  if (authLoading || loading) {
    return (
      <div className={styles.wrapper}>
        <Navbar />
        <div className="container" style={{ paddingTop: 40 }}>
          <div className={styles.grid}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 12 }} />)}
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
            <button type="button" onClick={() => setShowJoinModal(true)} className="btn btn-secondary">
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
                <button type="button" className={styles.closeBtn} onClick={() => !joining && setShowJoinModal(false)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleJoinTrip} className={styles.modalBody}>
                <p className={styles.modalDesc}>
                  Enter the invite code (e.g. <strong>TOKYO26</strong>) shared by your trip organizer.
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
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowJoinModal(false)} disabled={joining}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={joining || !inviteCode.trim()}>
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
