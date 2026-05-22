import { useDriverPresence } from '@/hooks/useDriverPresence';
import { useAuth } from '@/services/AuthContext';
import { ensureDriverPresenceDoc } from '@/services/driverPresence';
import React, { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

type DriverPresenceValue = ReturnType<typeof useDriverPresence>;

const DriverPresenceContext = createContext<DriverPresenceValue | null>(null);

/** One presence listener + toggle for the entire driver tab stack. */
export function DriverPresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid?.trim() ?? '';
  const ensuredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || ensuredRef.current === uid) return;
    ensuredRef.current = uid;
    void ensureDriverPresenceDoc(uid, user?.displayName).catch((error) => {
      console.error('[driver] ensureDriverPresenceDoc failed', error);
      ensuredRef.current = null;
    });
  }, [uid, user?.displayName]);

  const value = useDriverPresence(uid || null, {
    enabled: Boolean(uid),
    displayName: user?.displayName,
  });

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
