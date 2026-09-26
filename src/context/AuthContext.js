'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getProfile, upsertProfile } from '@/lib/firebase/firestore';

const AuthContext = createContext({});

const DEMO_USER = {
  uid: 'd0000000-0000-0000-0000-000000000001',
  id: 'd0000000-0000-0000-0000-000000000001',
  email: 'demo@triptogether.app',
  displayName: 'Demo Explorer',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Normalize to match legacy shape (id + uid both set)
        const u = { ...firebaseUser, id: firebaseUser.uid };
        setUser(u);
        try {
          let p = await getProfile(firebaseUser.uid);
          if (!p) {
            // Auto-create profile on first login
            await upsertProfile(firebaseUser.uid, {
              full_name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Traveler',
              email: firebaseUser.email,
            });
            p = { id: firebaseUser.uid, full_name: firebaseUser.displayName, email: firebaseUser.email };
          }
          setProfile(p);
        } catch (_) {
          setProfile({ id: firebaseUser.uid, full_name: firebaseUser.displayName, email: firebaseUser.email });
        }
      } else {
        // Check for demo mode
        if (typeof window !== 'undefined' && localStorage.getItem('demo_user_active') === 'true') {
          setUser(DEMO_USER);
          setProfile({ id: DEMO_USER.uid, full_name: 'Demo Explorer', email: DEMO_USER.email });
        } else {
          setUser(null);
          setProfile(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginAsDemo = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('demo_user_active', 'true');
      document.cookie = 'demo_user=true; path=/; max-age=86400';
    }
    setUser(DEMO_USER);
    setProfile({ id: DEMO_USER.uid, full_name: 'Demo Explorer', email: DEMO_USER.email });
    setLoading(false);
  };

  const signIn = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email, password, fullName) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (fullName && result.user) {
      await updateProfile(result.user, { displayName: fullName });
      await upsertProfile(result.user.uid, { full_name: fullName, email });
    }
    return result;
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demo_user_active');
      document.cookie = 'demo_user=; path=/; max-age=0';
    }
    try {
      await firebaseSignOut(auth);
    } catch (_) {}
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, signIn, signUp, signInWithGoogle, loginAsDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
