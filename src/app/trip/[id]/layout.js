'use client';
import { useEffect, useState, createContext, useContext } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import { MapPin, Calendar, Shield, Copy, Check } from 'lucide-react';
import { formatDateRange, getResilienceColor, getInitials, getAvatarColor } from '@/lib/utils';
import { getTrip, getTripMembers, getProfile } from '@/lib/firebase/firestore';
import styles from './layout.module.css';

// Trip context so child pages can access trip data without refetching
const TripContext = createContext({});
export const useTrip = () => useContext(TripContext);

function TripLayoutContent({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchTrip = async () => {
    // 1. Try Firestore
    let tripData = null;
    try { tripData = await getTrip(id); } catch (_) {}

    // 2. Fallback to localStorage cache
    if (!tripData && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('cached_trip_' + id);
        if (cached) tripData = JSON.parse(cached);
      } catch (_) {}
    }

    // 3. Demo trip fallback
    if (!tripData && id === 'a0000000-0000-0000-0000-000000000001') {
      tripData = {
        id: 'a0000000-0000-0000-0000-000000000001',
        title: 'Tokyo Cherry Blossom & Mount Fuji Odyssey',
        destination: 'Tokyo',
        country: 'Japan',
        description: 'High-resilience group exploration across Shinjuku, Shibuya, Kyoto bullet train, and Mount Fuji.',
        start_date: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
        end_date: new Date(Date.now() + 86400000 * 16).toISOString().slice(0, 10),
        budget: 145000,
        currency: 'INR',
        invite_code: 'TOKYO26',
        status: 'active',
        resilience_score: 92,
      };
    }
    setTrip(tripData);

    // Fetch members
    let memberList = [];
    try {
      const mems = await getTripMembers(id);
      for (const m of mems) {
        try {
          const p = await getProfile(m.user_id || m.id);
          if (p) memberList.push({ ...p, role: m.role });
        } catch (_) {
          memberList.push({ id: m.user_id || m.id, full_name: m.full_name || 'Member', role: m.role });
        }
      }
    } catch (_) {}

    if (memberList.length === 0) {
      const currentUserId = user?.uid || user?.id || tripData?.owner_id || 'd0000000-0000-0000-0000-000000000001';
      const currentUserName = user?.displayName || user?.user_metadata?.full_name || 'Adinath (You)';
      memberList = [
        { id: currentUserId, full_name: currentUserName, role: 'owner' },
        { id: 'd0000000-0000-0000-0000-000000000002', full_name: 'Priya Sharma', role: 'member' },
        { id: 'd0000000-0000-0000-0000-000000000003', full_name: 'Rohan Verma', role: 'member' },
      ];
    }
    setMembers(memberList);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchTrip();
  }, [user, id]);

  const tabs = [
    { label: 'Overview', href: `/trip/${id}` },
    { label: 'Itinerary', href: `/trip/${id}/itinerary` },
    { label: 'Disruption Center', href: `/trip/${id}/disruption` },
    { label: 'Expenses', href: `/trip/${id}/expenses` },
    { label: 'Settlement', href: `/trip/${id}/settlement` },
    { label: 'Members', href: `/trip/${id}/members` },
  ];

  const isActive = (href) => {
    if (href === `/trip/${id}`) return pathname === href;
    return pathname.startsWith(href);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container" style={{ paddingTop: 40 }}>
          <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 40, borderRadius: 8, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 400, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container empty-state" style={{ paddingTop: 80 }}>
          <h3>Trip not found</h3>
          <p>This trip doesn&apos;t exist or you don&apos;t have access.</p>
          <Link href="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <TripContext.Provider value={{ trip, members, setTrip, setMembers, fetchTrip, user }}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />

        {/* Trip Header */}
        <div className={styles.tripHeader}>
          <div className="container">
            <div className={styles.headerRow}>
              <div className={styles.headerInfo}>
                <h1>{trip.title}</h1>
                <div className={styles.headerMeta}>
                  <span><MapPin size={14} /> {trip.destination}{trip.country ? `, ${trip.country}` : ''}</span>
                  <span><Calendar size={14} /> {formatDateRange(trip.start_date, trip.end_date)}</span>
                  <span style={{ color: getResilienceColor(trip.resilience_score || 85) }}>
                    <Shield size={14} /> Score: {trip.resilience_score || 85}
                  </span>
                </div>
              </div>
              <div className={styles.headerRight}>
                <div className="avatar-group">
                  {members.slice(0, 4).map(m => (
                    <div key={m.id} className="avatar avatar-sm" style={{ background: getAvatarColor(m.full_name) }} title={m.full_name}>
                      {getInitials(m.full_name)}
                    </div>
                  ))}
                  {members.length > 4 && (
                    <div className="avatar avatar-sm" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                      +{members.length - 4}
                    </div>
                  )}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => {
                  navigator.clipboard.writeText(trip.invite_code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : trip.invite_code}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabBar}>
          <div className="container">
            <div className="tabs">
              {tabs.map(tab => (
                <Link key={tab.href} href={tab.href} className={`tab ${isActive(tab.href) ? 'tab-active' : ''}`}>
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="container" style={{ flex: 1, paddingTop: 32, paddingBottom: 80 }}>
          {children}
        </main>
      </div>
    </TripContext.Provider>
  );
}

export default function TripLayout({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <TripLayoutContent>{children}</TripLayoutContent>
      </ToastProvider>
    </AuthProvider>
  );
}
