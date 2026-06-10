import { logQuerySource } from '@/lib/driverActiveOrderFilter';
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
          for (const row of Array.isArray(rows) ? rows : []) {
            logQuerySource(row.id, row.status, row.deliveryStatus, 'useDriverOrders', {
              firestorePath: `orders/${row.id}`,
              driverId: row.driverId,
              assignedDriverId: row.assignedDriverId,
              entersActiveList: true,
            });
          }
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
