import { useDriverPresence } from '@/hooks/useDriverPresence';
import { useAuthUid } from '@/hooks/useAuthUid';
import {
  ensureDriverPresenceDoc,
  writeDriverOnlinePresence,
} from '@/services/driverPresence';
import { logDriverLayoutState } from '@/utils/driverLifecycleLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import { usePathname, useSegments } from 'expo-router';
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type DriverPresenceValue = ReturnType<typeof useDriverPresence>;

const DriverPresenceContext = createContext<DriverPresenceValue | null>(null);

type DriverPresenceProviderProps = {
  children: ReactNode;
  uid?: string;
};

function DriverPresenceProviderInner({ children, uid: uidProp }: DriverPresenceProviderProps) {
  const pathname = usePathname();
  const segments = useSegments();
  const authUid = useAuthUid();
  const uid = (uidProp ?? authUid).trim();
  useDriverMountLog('DriverPresenceProvider', uid || null);

  useEffect(() => {
    logDriverLayoutState({
      pathname,
      segments: segments as string[],
      routeGroup: '(driver)',
      role: 'driver',
      authReady: true,
      roleResolved: true,
      uid: uid || null,
      providerReady: Boolean(uid),
      reason: 'DriverPresenceProvider-mounted',
    });
  }, [pathname, segments, uid]);

  const ensuredRef = useRef<string | null>(null);
  const displayNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    void (async () => {
      try {
        if (ensuredRef.current !== uid) {
          ensuredRef.current = uid;
          await ensureDriverPresenceDoc(uid, displayNameRef.current);
        }
        if (cancelled) return;
        await writeDriverOnlinePresence(true);
      } catch (error) {
        console.error('[driver] auto online on session start failed', error);
        ensuredRef.current = null;
      }
    })();

    const onAppStateChange = (nextState: AppStateStatus) => {
      if (cancelled) return;
      if (nextState === 'active') {
        void writeDriverOnlinePresence(true).catch((error) => {
          console.error('[driver] set online on foreground failed', error);
        });
        return;
      }
      if (nextState === 'background' || nextState === 'inactive') {
        void writeDriverOnlinePresence(false).catch((error) => {
          console.error('[driver] set offline on background failed', error);
        });
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      subscription.remove();
    };
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
