import {
  subscribeDriverDeliveryStats,
  type DriverDeliveryStats,
} from '@/services/driverService';
import { useAuthUid } from '@/hooks/useAuthUid';
import { logListenerSubscribe, logListenerUnsubscribe } from '@/utils/driverListenerLog';
import { logDriverLayoutState } from '@/utils/driverLifecycleLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import { safeUnsubscribe } from '@/utils/safeOnSnapshot';
import { usePathname, useSegments } from 'expo-router';
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const EMPTY_STATS: DriverDeliveryStats = {
  deliveries: 0,
  earnings: 0,
  rating: 5.0,
};

function statsEqual(a: DriverDeliveryStats, b: DriverDeliveryStats): boolean {
  return (
    a.deliveries === b.deliveries &&
    a.earnings === b.earnings &&
    a.rating === b.rating
  );
}

type DriverRealtimeValue = {
  stats: DriverDeliveryStats;
  statsLoading: boolean;
};

const DriverRealtimeContext = createContext<DriverRealtimeValue | null>(null);

type DriverRealtimeProviderProps = {
  children: ReactNode;
  uid?: string;
};

function DriverRealtimeProviderInner({ children, uid: uidProp }: DriverRealtimeProviderProps) {
  const pathname = usePathname();
  const segments = useSegments();
  const authUid = useAuthUid();
  const uid = (uidProp ?? authUid).trim();
  useDriverMountLog('DriverRealtimeProvider', uid || null);

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
      reason: 'DriverRealtimeProvider-mounted',
    });
  }, [pathname, segments, uid]);

  const [stats, setStats] = useState<DriverDeliveryStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(() => !uid);

  useEffect(() => {
    if (!uid) {
      return undefined;
    }

    const listenerName = 'driver.deliveryStats';
    logListenerSubscribe(listenerName, uid);
    setStatsLoading(true);

    const unsub = subscribeDriverDeliveryStats(uid, (next) => {
      setStats((prev) => (statsEqual(prev, next) ? prev : next));
      setStatsLoading((prev) => (prev ? false : prev));
    });

    return () => {
      logListenerUnsubscribe(listenerName, uid);
      safeUnsubscribe(unsub, listenerName);
    };
  }, [uid]);

  useEffect(() => {
    if (uid) return;
    setStats(EMPTY_STATS);
    setStatsLoading(false);
  }, [uid]); // not in listener cleanup — avoids setState during teardown

  const value = useMemo(
    () => ({
      stats,
      statsLoading,
    }),
    [stats.deliveries, stats.earnings, stats.rating, statsLoading],
  );

  return (
    <DriverRealtimeContext.Provider value={value}>{children}</DriverRealtimeContext.Provider>
  );
}

export const DriverRealtimeProvider = memo(DriverRealtimeProviderInner);

export function useDriverDeliveryStats(): DriverRealtimeValue {
  const ctx = useContext(DriverRealtimeContext);
  if (!ctx) {
    throw new Error('useDriverDeliveryStats must be used within DriverRealtimeProvider');
  }
  return ctx;
}
