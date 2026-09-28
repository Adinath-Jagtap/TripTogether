'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Plus, MapPin, Calendar, Users, Clock, Shield, KeyRound, X, Trash2, AlertTriangle } from 'lucide-react';
import { formatDateRange, formatCurrency, getInitials, getAvatarColor, getResilienceColor } from '@/lib/utils';
import {
  getUserTrips, getTripsByMembership, getTrip, getMemberCount,
  getTripByInviteCode, addTripMember, deleteTrip,
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
  const [deletingId, setDeletingId] = useState(null);     // tripId being confirmed
  const [deleting, setDeleting] = useState(false);         // deletion in progress


  // AUTH GUARD: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || authLoading) {
      if (!authLoading && !user) setLoading(false);
      return;
    }

    const fetchTrips = async () => {
      try {
        const uid = user.uid || user.id;

        // Only fetch from Firestore — no localStorage merge (prevents data leakage)
        let ownedTrips = [];
        try { ownedTrips = await getUserTrips(uid); } catch (_) { }

        let memberTrips = [];
        try { memberTrips = await getTripsByMembership(uid); } catch (_) { }

        // Deduplicate (a user can be both owner and member)
        const tripMap = new Map();
        ownedTrips.forEach(t => tripMap.set(t.id, t));
        memberTrips.forEach(t => { if (!tripMap.has(t.id)) tripMap.set(t.id, t); });

        const allTrips = Array.from(tripMap.values());

        // Get member counts
        for (const trip of allTrips) {
          try {
            const count = await getMemberCount(trip.id);
            trip.memberCount = count > 0 ? count : 1;
          } catch (_) {
            trip.memberCount = trip.member_ids?.length || 1;
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
      try { foundTrip = await getTripByInviteCode(cleanCode); } catch (_) { }

      if (!foundTrip) {
        toast.error(`No trip found for code "${cleanCode}". Please verify and try again.`);
        setJoining(false);
        return;
      }

      // Add user as member in Firestore
      const uid = user?.uid || user?.id;
      if (uid) {
        try {
          await addTripMember(foundTrip.id, uid, { role: 'member' });
        } catch (_) { }
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

  const handleDeleteTrip = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await deleteTrip(deletingId);
      setTrips(prev => prev.filter(t => t.id !== deletingId));
      toast.success('Trip deleted successfully.');
    } catch (err) {
      console.error('Delete trip error:', err);
      toast.error('Failed to delete trip. Please try again.');
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  };


  // Don't render anything if not authenticated (redirect is happening)
  if (!user && !authLoading) return null;

  if (authLoading || loading) {
    return (
      <div className={styles.wrapper}>
        <Navbar />
        <div className="container" style={{ paddingTop: 'calc(var(--navbar-height, 56px) + 28px)' }}>
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
      <main className="container" style={{ width: '100%', flex: 1, paddingTop: 'calc(var(--navbar-height, 56px) + 28px)', paddingBottom: 80 }}>
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
            {trips.map(trip => {
              const isOwner = (user?.uid || user?.id) === trip.owner_id;
              return (
                <div key={trip.id} className={styles.tripCardWrap}>
                  <Link href={`/trip/${trip.id}`} className={`card ${styles.tripCard}`}>
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
                  {isOwner && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={e => { e.stopPropagation(); setDeletingId(trip.id); }}
                      title="Delete trip"
                      aria-label="Delete trip"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
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

        {/* Delete Confirmation Modal */}
        {deletingId && (
          <div className={styles.modalOverlay} onClick={() => !deleting && setDeletingId(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 style={{ color: 'var(--danger)' }}><AlertTriangle size={20} color="var(--danger)" /> Delete Trip?</h2>
                <button type="button" className={styles.closeBtn} onClick={() => setDeletingId(null)} aria-label="Close" disabled={deleting}>
                  <X size={18} />
                </button>
              </div>
              <div className={styles.modalBody}>
                <p className={styles.modalDesc}>
                  This will <strong>permanently delete</strong> the trip and all its bookings, expenses, and data. This action cannot be undone.
                </p>
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', fontSize: '0.8125rem', color: '#991B1B', fontWeight: 500 }}>
                  ⚠️ All members will lose access immediately.
                </div>
                <div className={styles.modalActions}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeletingId(null)} disabled={deleting}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={handleDeleteTrip} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
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
