import { subscribeDriverActiveOrders, type ActiveDelivery } from '@/services/delivery';
import { useEffect, useMemo, useState } from 'react';

export function useDriverOrders(driverId: string | null | undefined) {
  const [orders, setOrders] = useState<ActiveDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const unsub = subscribeDriverActiveOrders(driverId, (rows) => {
        try {
          setOrders(Array.isArray(rows) ? rows : []);
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('[useDriverOrders] onData', e);
          setOrders([]);
          setLoading(false);
          setError('parse');
        }
      });
      return () => unsub();
    } catch (e) {
      console.error('[useDriverOrders]', e);
      setOrders([]);
      setLoading(false);
      setError('subscribe');
    }
  }, [driverId]);

  return useMemo(
    () => ({
      orders: orders ?? [],
      loading,
      stale: false,
      error,
    }),
    [orders, loading, error],
  );
}
