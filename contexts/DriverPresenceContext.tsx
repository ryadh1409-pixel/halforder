import { useDriverPresence } from '@/hooks/useDriverPresence';
import { useAuthUid } from '@/hooks/useAuthUid';
import { ensureDriverPresenceDoc } from '@/services/driverPresence';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type DriverPresenceValue = ReturnType<typeof useDriverPresence>;

const DriverPresenceContext = createContext<DriverPresenceValue | null>(null);

type DriverPresenceProviderProps = {
  children: ReactNode;
  uid?: string;
};

function DriverPresenceProviderInner({ children, uid: uidProp }: DriverPresenceProviderProps) {
  const authUid = useAuthUid();
  const uid = (uidProp ?? authUid).trim();
  useDriverMountLog('DriverPresenceProvider', uid || null);

  const ensuredRef = useRef<string | null>(null);
  const displayNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || ensuredRef.current === uid) return;
    ensuredRef.current = uid;
    void ensureDriverPresenceDoc(uid, displayNameRef.current).catch((error) => {
      console.error('[driver] ensureDriverPresenceDoc failed', error);
      ensuredRef.current = null;
    });
  }, [uid]);

  const presence = useDriverPresence(uid || null, Boolean(uid));
  const value = useMemo(
    () => presence,
    [
      presence.isOnline,
      presence.loading,
      presence.toggling,
      presence.rating,
      presence.setOnlineStatus,
    ],
  );

  return (
    <DriverPresenceContext.Provider value={value}>{children}</DriverPresenceContext.Provider>
  );
}

export const DriverPresenceProvider = memo(DriverPresenceProviderInner);

export function useDriverPresenceContext(): DriverPresenceValue {
  const ctx = useContext(DriverPresenceContext);
  if (!ctx) {
    throw new Error('useDriverPresenceContext must be used within DriverPresenceProvider');
  }
  return ctx;
}
