import {
  subscribeDriverDeliveryStats,
  type DriverDeliveryStats,
} from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import { logListenerSubscribe, logListenerUnsubscribe } from '@/utils/driverListenerLog';
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  const { user } = useAuth();
  const uid = user?.uid?.trim() ?? '';
  const [stats, setStats] = useState<DriverDeliveryStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

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
      setStats(next);
      setStatsLoading(false);
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
