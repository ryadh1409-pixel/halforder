import {
  subscribeDriverDeliveryStats,
  type DriverDeliveryStats,
} from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import { logListenerSubscribe, logListenerUnsubscribe } from '@/utils/driverListenerLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/** One delivery-stats listener for the entire driver stack (Hub + Earnings). */
export function DriverRealtimeProvider({ children }: { children: ReactNode }) {
  useDriverMountLog('DriverRealtimeProvider');
  const { user } = useAuth();
  const uid = user?.uid?.trim() ?? '';
  const [stats, setStats] = useState<DriverDeliveryStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const subscribedUidRef = useRef<string | null>(null);

  const applyStats = useCallback((next: DriverDeliveryStats) => {
    setStats((prev) => (statsEqual(prev, next) ? prev : next));
    setStatsLoading((prev) => (prev ? false : prev));
  }, []);

  useEffect(() => {
    if (!uid) {
      subscribedUidRef.current = null;
      setStats(EMPTY_STATS);
      setStatsLoading(false);
      return undefined;
    }

    const uidChanged = subscribedUidRef.current !== uid;
    subscribedUidRef.current = uid;

    const listenerName = 'driver.deliveryStats';
    logListenerSubscribe(listenerName);
    if (uidChanged) {
      setStatsLoading(true);
    }

    const unsub = subscribeDriverDeliveryStats(uid, applyStats);

    return () => {
      logListenerUnsubscribe(listenerName);
      if (subscribedUidRef.current === uid) {
        subscribedUidRef.current = null;
      }
      unsub();
    };
  }, [uid, applyStats]);

  const value = useMemo(
    () => ({
      stats,
      statsLoading,
    }),
    [stats, statsLoading],
  );

  return (
    <DriverRealtimeContext.Provider value={value}>{children}</DriverRealtimeContext.Provider>
  );
}

export function useDriverDeliveryStats(): DriverRealtimeValue {
  const ctx = useContext(DriverRealtimeContext);
  if (!ctx) {
    throw new Error('useDriverDeliveryStats must be used within DriverRealtimeProvider');
  }
  return ctx;
}
