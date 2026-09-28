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

// Demo account — stored in Firestore under this fixed UID
const DEMO_UID = 'd0000000-0000-0000-0000-000000000001';
const DEMO_USER = {
  uid: DEMO_UID,
  id: DEMO_UID,
  email: 'demo@triptogether.app',
  displayName: 'Demo Explorer',
};

// Helper: set or clear the __session cookie for middleware auth gating
function setSessionCookie(value) {
  if (typeof document === 'undefined') return;
  if (value) {
    document.cookie = `__session=${value}; path=/; max-age=3600; SameSite=Lax`;
  } else {
    document.cookie = '__session=; path=/; max-age=0';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Set session cookie for middleware
        setSessionCookie(firebaseUser.uid);

        const u = { ...firebaseUser, id: firebaseUser.uid };
        setUser(u);
        try {
          let p = await getProfile(firebaseUser.uid);
          if (!p) {
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
          setSessionCookie('demo');
          setUser(DEMO_USER);
          setProfile({ id: DEMO_UID, full_name: 'Demo Explorer', email: DEMO_USER.email });
        } else {
          setSessionCookie(null);
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
    }
    setSessionCookie('demo');
    document.cookie = 'demo_user=true; path=/; max-age=86400';
    setUser(DEMO_USER);
    setProfile({ id: DEMO_UID, full_name: 'Demo Explorer', email: DEMO_USER.email });
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
    // Clear all session state
    setSessionCookie(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('demo_user_active');
    }
    document.cookie = 'demo_user=; path=/; max-age=0';
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
