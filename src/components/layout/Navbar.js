'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Menu, X, MapPin, LogOut, User, LayoutDashboard } from 'lucide-react';
import { getInitials, getAvatarColor } from '@/lib/utils';
import styles from './Navbar.module.css';

export default function Navbar() {
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const isLanding = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`${styles.navbar} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          <MapPin size={22} strokeWidth={2.5} />
          <span>TripTogether</span>
        </Link>

        {/* Desktop Nav */}
        <div className={styles.navLinks}>
          {isLanding && (
            <>
              <a href="#features" className={styles.navLink}>Features</a>
              <a href="#how-it-works" className={styles.navLink}>How It Works</a>
            </>
          )}
          {user ? (
            <>
              <Link href="/dashboard" className={`${styles.navLink} ${pathname === '/dashboard' ? styles.active : ''}`}>
                <LayoutDashboard size={16} /> Dashboard
              </Link>
              <div className={styles.profileWrap}>
                <button className={styles.avatarBtn} onClick={() => setDropdownOpen(!dropdownOpen)}>
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

        {/* Mobile menu toggle */}
        <button className={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className={styles.mobileMenu}>
          {user ? (
            <>
              <Link href="/dashboard" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link href="/profile" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Profile</Link>
              <button className={styles.mobileLink} onClick={() => { signOut(); setMenuOpen(false); }}>Sign Out</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Log In</Link>
              <Link href="/auth/register" className={styles.mobileLink} onClick={() => setMenuOpen(false)}>Get Started</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
