'use client';
import { MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './Footer.module.css';

export default function Footer() {
  const { user } = useAuth();

  const handleReset = async () => {
    // Do nothing if logged out
    if (!user) return;

    try {
      // When logged in, delete all trips and related data from the database
      await fetch('/api/trip/reset', { method: 'POST' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user_trips');
        window.location.href = '/dashboard?reset=1';
      }
    } catch (err) {
      console.error('Failed to reset trips DB:', err);
    }
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <MapPin size={18} />
          {/* Hidden hotel portal link — looks like plain text, no underline/colour change.
              Tap 3× quickly to navigate (guards against accidental single-tap on mobile). */}
          <span
            onClick={(() => {
              let taps = 0, timer;
              return () => {
                taps++;
                clearTimeout(timer);
                if (taps >= 3) {
                  taps = 0;
                  window.location.href = '/hotel/login';
                } else {
                  timer = setTimeout(() => { taps = 0; }, 800);
                }
              };
            })()}
            style={{ cursor: 'default', userSelect: 'none' }}
            title=""
          >TripTogether</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p className={styles.copy}>Built for the TripTogether Hackathon &middot; {new Date().getFullYear()}</p>
          <button
            onClick={handleReset}
            title={user ? "Reset Database Trips" : ""}
            style={{
              background: 'transparent',
              border: 'none',
              color: user ? 'var(--text-tertiary)' : 'transparent',
              cursor: user ? 'pointer' : 'default',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              opacity: user ? 0.45 : 0,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { if (user) e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { if (user) e.currentTarget.style.opacity = '0.45'; }}
          >
            R
          </button>
        </div>
      </div>
    </footer>
  );
}
