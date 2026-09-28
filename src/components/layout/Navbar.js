'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { MapPin, LogOut, User, LayoutDashboard, Bell, ChevronLeft } from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';
import { markNotificationRead } from '@/lib/firebase/notifications';
import styles from './Navbar.module.css';

export default function Navbar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { user, profile, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [bellOpen, setBellOpen]           = useState(false);
  const [notifications, setNotifications] = useState([]);
  const bellRef = useRef(null);
  const profileRef = useRef(null);

  const isLanding = pathname === '/';
  const onHero = isLanding && !scrolled;
  const landingColor = onHero ? 'rgba(255,255,255,0.95)' : undefined;
  const isTripPage = pathname.startsWith('/trip/');
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Realtime notification listener — only when user is signed in
  useEffect(() => {
    if (!user?.uid) return;
    let unsub;
    import('firebase/firestore').then(({ onSnapshot, collection, query, where, limit }) => {
      import('@/lib/firebase/config').then(({ db }) => {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          limit(20)
        );
        unsub = onSnapshot(q, snap => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a, b) => {
            const at = a.created_at?.toMillis?.() ?? 0;
            const bt = b.created_at?.toMillis?.() ?? 0;
            return bt - at;
          });
          setNotifications(docs);
        }, err => {
          console.error('[Navbar] notifications onSnapshot error:', err.message);
        });
      });
    });
    return () => unsub?.();
  }, [user?.uid]);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNotificationClick = async (n) => {
    setBellOpen(false);
    if (!n.read) await markNotificationRead(n.id);

    // If this notification requires calling the hotel directly, open the phone dialer
    if (n.action === 'call_hotel' && n.hotelPhone) {
      const clean = n.hotelPhone.replace(/\s+/g, '');
      window.location.href = `tel:${clean}`;
      return;
    }

    // Otherwise deep-link to the disruption page for context
    if (n.tripId) router.push(`/trip/${n.tripId}/disruption`);
  };


  return (
    <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        {/* Left: Logo or Back */}
        <div className={styles.leftSection}>
          {isTripPage && (
            <button className={styles.backBtn} onClick={() => router.push('/dashboard')} aria-label="Back to dashboard">
              <ChevronLeft size={20} />
            </button>
          )}
          <Link href={user ? '/dashboard' : '/'} className={styles.logo} style={{ color: landingColor }}>
            <MapPin size={20} strokeWidth={2.5} style={{ color: landingColor }} />
            <span className={styles.logoText}>TripTogether</span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <div className={styles.navLinks}>
          {isLanding && (
            <>
              <a href="#features" className={styles.navLink} style={{ color: landingColor }}>Features</a>
              <a href="#how-it-works" className={styles.navLink} style={{ color: landingColor }}>How It Works</a>
            </>
          )}
          {user ? (
            <>
              <Link href="/dashboard" className={`${styles.navLink} ${pathname === '/dashboard' ? styles.active : ''}`} style={{ color: landingColor }}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>

              {/* Bell icon */}
              <div className={styles.bellWrap} ref={bellRef}>
                <button
                  className={styles.bellBtn}
                  style={{ color: landingColor }}
                  onClick={() => { setBellOpen(o => !o); setDropdownOpen(false); }}
                  aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>

                {bellOpen && (
                  <div className={styles.bellDropdown}>
                    <div className={styles.bellHeader}>
                      <span>Notifications</span>
                      {unreadCount > 0 && <span className={styles.bellUnreadLabel}>{unreadCount} new</span>}
                    </div>
                    {notifications.length === 0 ? (
                      <div className={styles.bellEmpty}>No notifications yet</div>
                    ) : (
                      <div className={styles.bellList}>
                        {notifications.map(n => (
                          <button
                            key={n.id}
                            className={`${styles.bellItem} ${n.read ? styles.bellItemRead : styles.bellItemUnread}`}
                            onClick={() => handleNotificationClick(n)}
                          >
                            <div className={styles.bellItemTitle}>{n.title}</div>
                            <div className={styles.bellItemBody}>{n.body}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.profileWrap} ref={profileRef}>
                <button className={styles.avatarBtn} onClick={() => { setDropdownOpen(!dropdownOpen); setBellOpen(false); }}>
                  <div className="avatar avatar-sm" style={{ background: getAvatarColor(profile?.full_name) }}>
                    {getInitials(profile?.full_name)}
                  </div>
                </button>
                {dropdownOpen && (
                  <div className={styles.dropdown}>
                    <div className={styles.dropdownName}>{profile?.full_name || 'User'}</div>
                    <div className={styles.dropdownEmail}>{profile?.email}</div>
                    <hr className="divider" style={{ margin: '8px 0' }} />
                    <Link href="/profile" className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
                      <User size={14} /> Profile
                    </Link>
                    <button className={styles.dropdownItem} onClick={() => { signOut(); setDropdownOpen(false); }}>
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={styles.navLink}>Log In</Link>
              <Link href="/auth/register" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          )}
        </div>

        {/* Mobile Right: Bell + Profile (always visible on mobile) */}
        {user && (
          <div className={styles.mobileRight}>
            <div className={styles.bellWrap} ref={null}>
              <button
                className={styles.bellBtn}
                onClick={() => { setBellOpen(o => !o); setDropdownOpen(false); }}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className={styles.bellBadge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>
            </div>
            <div className={styles.profileWrap}>
              <button className={styles.avatarBtn} onClick={() => { setDropdownOpen(!dropdownOpen); setBellOpen(false); }}>
                <div className="avatar avatar-sm" style={{ background: getAvatarColor(profile?.full_name) }}>
                  {getInitials(profile?.full_name)}
                </div>
              </button>
              {dropdownOpen && (
                <div className={styles.dropdown}>
                  <div className={styles.dropdownName}>{profile?.full_name || 'User'}</div>
                  <div className={styles.dropdownEmail}>{profile?.email}</div>
                  <hr className="divider" style={{ margin: '8px 0' }} />
                  <Link href="/profile" className={styles.dropdownItem} onClick={() => setDropdownOpen(false)}>
                    <User size={14} /> Profile
                  </Link>
                  <button className={styles.dropdownItem} onClick={() => { signOut(); setDropdownOpen(false); }}>
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {!user && (
          <div className={styles.mobileRight}>
            <Link href="/auth/login" className={styles.navLink}>Log In</Link>
          </div>
        )}
      </div>

      {/* Bell dropdown on mobile (rendered outside navLinks) */}
      {bellOpen && (
        <div className={styles.mobileBellDropdown}>
          <div className={styles.bellHeader}>
            <span>Notifications</span>
            {unreadCount > 0 && <span className={styles.bellUnreadLabel}>{unreadCount} new</span>}
          </div>
          {notifications.length === 0 ? (
            <div className={styles.bellEmpty}>No notifications yet</div>
          ) : (
            <div className={styles.bellList}>
              {notifications.map(n => (
                <button
                  key={n.id}
                  className={`${styles.bellItem} ${n.read ? styles.bellItemRead : styles.bellItemUnread}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className={styles.bellItemTitle}>{n.title}</div>
                  <div className={styles.bellItemBody}>{n.body}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
