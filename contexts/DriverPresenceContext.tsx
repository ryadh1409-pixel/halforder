import { useDriverPresence } from '@/hooks/useDriverPresence';
import { useAuth } from '@/services/AuthContext';
import { ensureDriverPresenceDoc } from '@/services/driverPresence';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

type DriverPresenceValue = ReturnType<typeof useDriverPresence>;

const DriverPresenceContext = createContext<DriverPresenceValue | null>(null);

/** One presence listener + toggle for the entire driver tab stack. */
export function DriverPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid?.trim() ?? '';
  useDriverMountLog('DriverPresenceProvider', uid || null);
  const presenceEnabled = Boolean(uid);
  const ensuredRef = useRef<string | null>(null);
  const displayNameRef = useRef(user?.displayName ?? null);
  displayNameRef.current = user?.displayName ?? null;

  useEffect(() => {
    if (!uid || ensuredRef.current === uid) return;
    ensuredRef.current = uid;
    void ensureDriverPresenceDoc(uid, displayNameRef.current).catch((error) => {
      console.error('[driver] ensureDriverPresenceDoc failed', error);
      ensuredRef.current = null;
    });
  }, [uid]);

  const value = useDriverPresence(uid || null, presenceEnabled);

  return (
    <DriverPresenceContext.Provider value={value}>{children}</DriverPresenceContext.Provider>
  );
}

export function useDriverPresenceContext(): DriverPresenceValue {
  const ctx = useContext(DriverPresenceContext);
  if (!ctx) {
    throw new Error('useDriverPresenceContext must be used within DriverPresenceProvider');
  }
  return ctx;
}
