'use client';

import { ADMIN_EMAIL, isAdminEmail } from '@/lib/admin-constants';
import { auth } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type AuthState = {
  user: User | null;
  ready: boolean;
  isAdmin: boolean;
  signInAdmin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const isAdmin = useMemo(
    () => (user ? isAdminEmail(user.email) : false),
    [user],
  );

  const signInAdmin = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const trimmed = email.trim().toLowerCase();
    if (trimmed !== ADMIN_EMAIL) {
      setAuthError(`Only ${ADMIN_EMAIL} may sign in.`);
      throw new Error('Not admin email');
    }
    const cred = await signInWithEmailAndPassword(auth, trimmed, password);
    if (!isAdminEmail(cred.user.email)) {
      await signOut(auth);
      setAuthError('Unauthorized account.');
      throw new Error('Unauthorized');
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin,
      signInAdmin,
      logout,
      authError,
    }),
    [user, ready, isAdmin, signInAdmin, logout, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
