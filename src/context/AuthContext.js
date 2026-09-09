'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const AuthContext = createContext({});

const DEMO_USER = {
  id: 'd0000000-0000-0000-0000-000000000001',
  email: 'demo@triptogether.app',
  user_metadata: { full_name: 'Demo Explorer' },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          setUser(u);
          const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single();
          setProfile(data);
        } else if (typeof window !== 'undefined' && localStorage.getItem('demo_user_active') === 'true') {
          setUser(DEMO_USER);
          setProfile({ id: DEMO_USER.id, full_name: 'Demo Explorer', email: DEMO_USER.email });
        }
      } catch (_) {
        if (typeof window !== 'undefined' && localStorage.getItem('demo_user_active') === 'true') {
          setUser(DEMO_USER);
          setProfile({ id: DEMO_USER.id, full_name: 'Demo Explorer', email: DEMO_USER.email });
        }
      }
      setLoading(false);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      if (u) {
        setUser(u);
        const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single();
        setProfile(data);
      } else if (typeof window !== 'undefined' && localStorage.getItem('demo_user_active') === 'true') {
        setUser(DEMO_USER);
        setProfile({ id: DEMO_USER.id, full_name: 'Demo Explorer', email: DEMO_USER.email });
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginAsDemo = async () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_user_active', 'true');
      document.cookie = 'demo_user=true; path=/; max-age=86400';
    }
    setUser(DEMO_USER);
    setProfile({ id: DEMO_USER.id, full_name: 'Demo Explorer', email: DEMO_USER.email });

    // Also attempt real Supabase sign-in so JWT session is authentic
    try {
      await supabase.auth.signInWithPassword({
        email: 'demo@triptogether.app',
        password: 'demo123456',
      });
    } catch (_) {}
  };

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demo_user_active');
      document.cookie = 'demo_user=; path=/; max-age=0';
    }
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, loginAsDemo, supabase }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
