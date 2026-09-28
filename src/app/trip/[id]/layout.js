'use client';
import { useEffect, useState, createContext, useContext } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import { MapPin, Calendar, Shield, Copy, Check, LayoutGrid, Route, Zap, Receipt, Handshake, Users, Globe } from 'lucide-react';
import { formatDateRange, getResilienceColor, getInitials, getAvatarColor } from '@/lib/utils';
import { getTrip, getTripMembers, getProfile } from '@/lib/firebase/firestore';
import styles from './layout.module.css';

const TripContext = createContext({});
export const useTrip = () => useContext(TripContext);

function TripLayoutContent({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [trip, setTrip] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [copied, setCopied] = useState(false);

  // AUTH GUARD: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [user, authLoading, router]);

  const fetchTrip = async () => {
    if (!user) return;
    const uid = user.uid || user.id;

    let tripData = null;
    try { tripData = await getTrip(id); } catch (_) {}

    // Fallback to localStorage cache only for trips the user created
    if (!tripData && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('cached_trip_' + id);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Only use cache if this user is the owner
          if (parsed.owner_id === uid) tripData = parsed;
        }
      } catch (_) {}
    }

    if (!tripData) {
      setLoading(false);
      return;
    }

    // ACCESS CONTROL: user must be owner or member
    const isMember = tripData.member_ids?.includes(uid);
    const isOwner = tripData.owner_id === uid;
    const isDemoAccount = uid === 'd0000000-0000-0000-0000-000000000001';

    if (!isOwner && !isMember && !isDemoAccount) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    setTrip(tripData);

    // Fetch real members from Firestore subcollection
    let memberList = [];
    try {
      const mems = await getTripMembers(id);
      for (const m of mems) {
        try {
          const p = await getProfile(m.user_id || m.id);
          if (p) memberList.push({ ...p, role: m.role });
          else memberList.push({ id: m.user_id || m.id, full_name: 'Member', role: m.role });
        } catch (_) {
          memberList.push({ id: m.user_id || m.id, full_name: 'Member', role: m.role });
        }
      }
    } catch (_) {}

    // If no members found in subcollection, show only current user (no fake members)
    if (memberList.length === 0) {
      const currentUserName = user?.displayName || user?.email?.split('@')[0] || 'You';
      memberList = [{ id: uid, full_name: currentUserName, email: user?.email, role: 'owner' }];
    }

    setMembers(memberList);
    setLoading(false);
  };

  useEffect(() => {
    if (user && !authLoading) fetchTrip();
  }, [user, authLoading, id]);

  // Desktop tab bar items
  const tabs = [
    { label: 'Overview', href: `/trip/${id}` },
    { label: 'Itinerary', href: `/trip/${id}/itinerary` },
    { label: 'Digital Twin & Weather', href: `/trip/${id}/digital-twin` },
    { label: 'Disruption Center', href: `/trip/${id}/disruption` },
    { label: 'Expenses', href: `/trip/${id}/expenses` },
    { label: 'Settlement', href: `/trip/${id}/settlement` },
    { label: 'Members', href: `/trip/${id}/members` },
  ];

  // Mobile bottom nav items (6 core tabs)
  const bottomNavItems = [
    { label: 'Overview', href: `/trip/${id}`, icon: LayoutGrid },
    { label: 'Itinerary', href: `/trip/${id}/itinerary`, icon: Route },
    { label: 'Digital Twin', href: `/trip/${id}/digital-twin`, icon: Globe },
    { label: 'Disruption', href: `/trip/${id}/disruption`, icon: Zap },
    { label: 'Expenses', href: `/trip/${id}/expenses`, icon: Receipt },
    { label: 'Settle', href: `/trip/${id}/settlement`, icon: Handshake },
  ];

  const isActive = (href) => {
    if (href === `/trip/${id}`) return pathname === href;
    return pathname.startsWith(href);
  };

  if (!user && !authLoading) return null;

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container" style={{ paddingTop: 'calc(var(--navbar-height, 56px) + 28px)' }}>
          <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 40, borderRadius: 8, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  // Access denied — not a member
  if (accessDenied) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container empty-state" style={{ paddingTop: 'calc(var(--navbar-height, 56px) + 40px)' }}>
          <div className="empty-state-icon">🔒</div>
          <h3>Access Denied</h3>
          <p>You are not a member of this trip. Ask the organizer for an invite code.</p>
          <Link href="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="container empty-state" style={{ paddingTop: 'calc(var(--navbar-height, 56px) + 40px)' }}>
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
                {/* Mobile Members Link */}
                <Link href={`/trip/${id}/members`} className={styles.membersLink}>
                  <Users size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Tab Bar — hidden on mobile */}
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

        <main className="container" style={{ flex: 1, paddingTop: 24, paddingBottom: 100 }}>
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="bottom-nav">
          {bottomNavItems.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`bottom-nav-item ${active ? 'active' : ''}`}
              >
                <Icon size={22} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
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
