import {
  subscribeDriverDeliveryStats,
  type DriverDeliveryStats,
} from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import { logListenerSubscribe, logListenerUnsubscribe } from '@/utils/driverListenerLog';
import { useDriverMountLog } from '@/utils/driverMountLog';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const EMPTY_STATS: DriverDeliveryStats = {
  deliveries: 0,
  earnings: 0,
  rating: 5.0,
};

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

  const onStatsRef = useRef((next: DriverDeliveryStats) => {
    setStats(next);
    setStatsLoading(false);
  });
  onStatsRef.current = (next: DriverDeliveryStats) => {
    setStats(next);
    setStatsLoading(false);
  };

  useEffect(() => {
    if (!uid) {
      setStats(EMPTY_STATS);
      setStatsLoading(false);
      return undefined;
    }

    const listenerName = 'driver.deliveryStats';
    logListenerSubscribe(listenerName);
    setStatsLoading(true);

    const unsub = subscribeDriverDeliveryStats(uid, (next) => {
      onStatsRef.current(next);
    });

    return () => {
      logListenerUnsubscribe(listenerName);
      unsub();
    };
  }, [uid]);

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
