'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
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
  const { loginAsDemo, supabase } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      if (email.toLowerCase().includes('demo')) {
        loginAsDemo();
        toast.success('Signed in as Demo Traveler!');
        router.push('/dashboard');
        return;
      }
      setError(err.message);
      setLoading(false);
    } else {
      toast.success('Welcome back!');
      router.push('/dashboard');
    }
  };

  const handleDemoClick = () => {
    loginAsDemo();
    toast.success('Welcome to Demo Mode! Loading trips...');
    router.push('/dashboard');
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={handleDemoClick}
              className="btn btn-secondary"
              style={{
                width: '100%',
                marginTop: 10,
                background: '#FEF3C7',
                borderColor: '#FDE68A',
                color: '#92400E',
                fontWeight: 600,
              }}
            >
              <Sparkles size={16} color="#B45309" />
              <span>Instant Demo Login (Tokyo Trip)</span>
            </button>
          </form>

          <div className={styles.divider}><span>or</span></div>

          <button onClick={handleGoogle} className="btn btn-secondary" style={{ width: '100%' }}>
            Continue with Google
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
