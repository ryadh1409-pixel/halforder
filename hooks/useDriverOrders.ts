import { useOptionalDriverActiveOrdersFeed } from '@/contexts/DriverActiveOrdersContext';
import { subscribeDriverActiveOrders, type ActiveDelivery } from '@/services/delivery';
import { useEffect, useMemo, useState } from 'react';

/**
 * Active driver orders — prefers the shell Context feed (one Firestore listener).
 * Falls back to the shared multiplexed subscribe only outside the provider.
 */
export function useDriverOrders(driverId: string | null | undefined) {
  const shared = useOptionalDriverActiveOrdersFeed();
  const [orders, setOrders] = useState<ActiveDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = driverId?.trim() ?? '';
  const useShared =
    Boolean(shared) && Boolean(uid) && shared!.driverId === uid;

  useEffect(() => {
    if (useShared) return;
    if (!uid) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribeDriverActiveOrders(uid, (rows) => {
      setOrders(Array.isArray(rows) ? rows : []);
      setLoading(false);
      setError(null);
    });
    return () => unsub();
  }, [uid, useShared]);

  return useMemo(() => {
    if (useShared && shared) {
      return {
        orders: shared.orders ?? [],
        loading: shared.loading,
        stale: false,
        error: shared.error,
      };
    }
    return {
      orders: orders ?? [],
      loading,
      stale: false,
      error,
    };
  }, [useShared, shared, orders, loading, error]);
}
