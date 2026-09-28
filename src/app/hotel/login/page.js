'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initPushNotifications } from '@/lib/firebase/messaging';
import { Hotel, Phone, CheckCircle2, ArrowRight, Sparkles, Shield, Building2 } from 'lucide-react';

export default function HotelLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fillDemo = () => {
    setName('Hotel Snow Peak Manali');
    setPhone('+918369848711');
    setError('');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!phone || !name) { setError('Both fields are required.'); return; }
    const cleanPhone = phone.replace(/\s+/g, '').trim();
    setLoading(true);
    setError('');

    try {
      await setDoc(doc(db, 'hotels', cleanPhone), {
        name,
        phone: cleanPhone,
        registered_at: serverTimestamp(),
      }, { merge: true });

      // Mark this device as a hotel device so the PWA launch
      // redirect sends it to /call/receive instead of /dashboard
      localStorage.setItem('hotelPhoneId', cleanPhone);
      localStorage.setItem('hotelName', name);

      // Register for push notifications immediately after registration
      // so the hotel gets incoming-call alerts even with screen off.
      await initPushNotifications(cleanPhone, 'hotel').catch(() => {});

      setRegistered(true);
      // Auto-navigate after 1.5s
      setTimeout(() => router.push('/call/receive'), 1500);
    } catch (err) {
      setError('Registration failed. Please try again.');
    }
    setLoading(false);
  };

  if (registered) {
    return (
      <div style={styles.page}>
        <div style={styles.ambientOrb} />
        <div style={styles.card}>
          <div style={styles.successIconWrapper}>
            <CheckCircle2 size={40} color="#059669" />
          </div>
          <h2 style={styles.title}>You&apos;re Registered!</h2>
          <p style={styles.sub}>
            When a guest&apos;s AI travel assistant needs to request check-in or reservation changes, your receiver will ring in real time.
          </p>
          <a href="/call/receive" style={styles.btnPrimary}>
            Open Call Receiver <ArrowRight size={18} />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.ambientOrb} />
      <div style={styles.card}>
        <div style={styles.badgeHeader}>
          <div style={styles.brandBadge}>
            <Building2 size={24} color="#FFFFFF" />
          </div>
          <span style={styles.portalTag}>PARTNER PORTAL</span>
        </div>

        <h2 style={styles.title}>Hotel Concierge Registration</h2>
        <p style={styles.sub}>
          Register your hotel to receive automated AI calls from TripTogether when travelers experience flight or train delays.
        </p>

        {/* Demo Helper Pill */}
        <button
          type="button"
          onClick={fillDemo}
          style={styles.demoPill}
          title="Click to pre-fill test hotel data"
        >
          <Sparkles size={14} color="#D97706" />
          <span>Demo autofill: <strong>Hotel Snow Peak (+918369848711)</strong></span>
        </button>

        <form onSubmit={handleRegister} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Hotel / Property Name</label>
            <div style={styles.inputWrapper}>
              <Hotel size={18} style={styles.inputIcon} />
              <input
                style={styles.input}
                type="text"
                placeholder="e.g. Hotel Snow Peak Manali"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Hotel Contact Phone</label>
            <div style={styles.inputWrapper}>
              <Phone size={18} style={styles.inputIcon} />
              <input
                style={styles.input}
                type="tel"
                placeholder="+918369848711"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <span style={styles.hint}>
              Must match the vendor phone number stored on booking itineraries.
            </span>
          </div>

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}

          <button type="submit" style={styles.btnPrimary} disabled={loading}>
            {loading ? 'Registering Device...' : 'Connect Call Receiver'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div style={styles.footerNote}>
          <Shield size={14} color="#9CA3AF" />
          <span>Protected by TripTogether automated booking ledger</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 0%, #FFFDF8 0%, #FAFAF8 50%, #F5F3ED 100%)',
    padding: '24px',
    fontFamily: "var(--font-sans, 'Inter', sans-serif)",
    position: 'relative',
    overflow: 'hidden',
  },
  ambientOrb: {
    position: 'absolute',
    top: '-100px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '500px',
    height: '350px',
    background: 'radial-gradient(circle, rgba(245, 158, 11, 0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
    filter: 'blur(50px)',
  },
  card: {
    background: '#FFFFFF',
    border: '1px solid var(--border-default, #EBE9E5)',
    borderRadius: '28px',
    padding: '44px 36px',
    maxWidth: '460px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(217, 119, 6, 0.03)',
    position: 'relative',
    zIndex: 1,
  },
  badgeHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  brandBadge: {
    width: '54px',
    height: '54px',
    borderRadius: '16px',
    background: 'var(--accent-gradient, linear-gradient(135deg, #F59E0B 0%, #D97706 100%))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(217, 119, 6, 0.28)',
  },
  portalTag: {
    fontSize: '0.6875rem',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: 'var(--accent, #D97706)',
    background: 'var(--accent-subtle, #FFFBEB)',
    padding: '3px 10px',
    borderRadius: '12px',
    border: '1px solid var(--accent-light, #FEF3C7)',
  },
  title: {
    fontSize: '1.45rem',
    fontWeight: '800',
    color: 'var(--text-primary, #1A1A1A)',
    letterSpacing: '-0.02em',
    margin: '0 0 8px',
  },
  sub: {
    color: 'var(--text-secondary, #5C5C5C)',
    fontSize: '0.875rem',
    lineHeight: 1.55,
    marginBottom: '20px',
  },
  demoPill: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    background: 'var(--accent-subtle, #FFFBEB)',
    border: '1px dashed var(--accent, #D97706)',
    borderRadius: '12px',
    padding: '8px 12px',
    fontSize: '0.75rem',
    color: 'var(--text-primary, #1A1A1A)',
    cursor: 'pointer',
    marginBottom: '20px',
    transition: 'background 0.15s ease',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'left',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: '600',
    color: 'var(--text-primary, #1A1A1A)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    color: 'var(--text-tertiary, #9CA3AF)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    background: 'var(--bg-subtle, #F7F6F3)',
    border: '1px solid var(--border-default, #EBE9E5)',
    borderRadius: '14px',
    padding: '12px 14px 12px 42px',
    color: 'var(--text-primary, #1A1A1A)',
    fontSize: '0.9375rem',
    outline: 'none',
    transition: 'all 0.15s ease',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary, #9CA3AF)',
    marginTop: '2px',
  },
  errorBanner: {
    background: '#FEF2F2',
    color: '#DC2626',
    border: '1px solid #FEE2E2',
    padding: '8px 12px',
    borderRadius: '10px',
    fontSize: '0.8125rem',
    fontWeight: '500',
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: 'var(--accent-gradient, linear-gradient(135deg, #F59E0B 0%, #D97706 100%))',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '16px',
    padding: '14px',
    fontSize: '0.9375rem',
    fontWeight: '700',
    cursor: 'pointer',
    textDecoration: 'none',
    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)',
    transition: 'all 0.15s ease',
    marginTop: '6px',
  },
  successIconWrapper: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    background: '#ECFDF5',
    border: '2px solid #A7F3D0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  footerNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '24px',
    fontSize: '0.75rem',
    color: 'var(--text-tertiary, #9CA3AF)',
  },
};
