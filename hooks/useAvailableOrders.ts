import { subscribeAvailableOrders, type DriverOrder } from '../services/driverService';
import { useEffect, useMemo, useState } from 'react';

export function useAvailableOrders() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      const unsub = subscribeAvailableOrders((rows) => {
        try {
          setOrders(Array.isArray(rows) ? rows : []);
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('[useAvailableOrders] onData', e);
          setOrders([]);
          setLoading(false);
          setError('parse');
        }
      });
      return () => unsub();
    } catch (e) {
      console.error('[useAvailableOrders]', e);
      setOrders([]);
      setLoading(false);
      setError('subscribe');
    }
  }, []);

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
