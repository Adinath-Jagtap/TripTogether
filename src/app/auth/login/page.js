'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import Navbar from '@/components/layout/Navbar';
import { Mail, Lock, Eye, EyeOff, MapPin, Sparkles } from 'lucide-react';
import styles from '../auth.module.css';

function LoginForm() {
  const [email, setEmail] = useState('demo@triptogether.app');
  const [password, setPassword] = useState('demo123456');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const toast = useToast();
  const { signIn, loginAsDemo, signInWithGoogle } = useAuth();
  const getFriendlyError = (errMsg) => {
    if (!errMsg) return 'Invalid login credentials';
    if (errMsg.includes('auth/invalid-credential') || errMsg.includes('auth/wrong-password') || errMsg.includes('auth/user-not-found')) {
      return 'Incorrect email or password. Please check and try again.';
    }
    if (errMsg.includes('auth/invalid-email')) return 'Please enter a valid email address.';
    if (errMsg.includes('auth/too-many-requests')) return 'Too many failed attempts. Please try again later.';
    return errMsg.replace(/^Firebase:\s*/i, '').replace(/\(auth\/[^)]+\)\.?/, '').trim();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (email.toLowerCase().includes('demo')) {
      loginAsDemo();
      toast.success('Welcome to Demo Mode!');
      router.push('/dashboard');
      return;
    }

    try {
      await signIn(email, password);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      setError(getFriendlyError(err.message));
      setLoading(false);
    }
  };

  const handleDemoClick = () => {
    loginAsDemo();
    toast.success('Welcome to Demo Mode! Loading trips...');
    router.push('/dashboard');
  };

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google!');
      router.push('/dashboard');
    } catch (err) {
      if (err.message?.includes('popup-closed')) return;
      setError(getFriendlyError(err.message || 'Google sign-in failed'));
    }
  };

  return (
    <div className={styles.wrapper}>
      <Navbar />
      <div className={styles.container}>
        <div className={`card ${styles.card}`}>
          <div className={styles.header}>
            <MapPin size={28} className={styles.headerIcon} />
            <h2>Welcome back</h2>
            <p>Sign in to continue your trips</p>
          </div>

          <form onSubmit={handleLogin} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className="form-group">
              <label className="form-label">Email</label>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} />
                <input type="email" className="form-input" style={{ paddingLeft: 38 }}
                  value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className={styles.inputWrap}>
                <Lock size={16} className={styles.inputIcon} />
                <input type={showPw ? 'text' : 'password'} className="form-input" style={{ paddingLeft: 38, paddingRight: 40 }}
                  value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                <button type="button" className={styles.pwToggle} onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            </button>

            <button
              type="button"
              onClick={handleDemoClick}
              className="btn btn-secondary"
              style={{
                width: '100%',
                marginTop: 6,
                background: '#FEF3C7',
                borderColor: '#FDE68A',
                color: '#92400E',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Sparkles size={16} color="#B45309" />
              <span>Instant Demo Login (Tokyo Trip)</span>
            </button>
          </form>

          <div className={styles.divider}><span>or</span></div>

          <button onClick={handleGoogle} className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#FFFFFF', border: '1px solid #D1D5DB' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span style={{ fontWeight: 600, color: '#374151' }}>Continue with Google</span>
          </button>

          <p className={styles.footer}>
            Don&apos;t have an account? <Link href="/auth/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <ToastProvider>
        <LoginForm />
      </ToastProvider>
    </AuthProvider>
  );
}
