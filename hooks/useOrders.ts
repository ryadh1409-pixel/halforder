import {
  getOrders,
  type RestaurantOrder,
} from '../services/orderService';
import { useEffect, useMemo, useState } from 'react';

export function useRestaurantOrders(restaurantId: string | null | undefined) {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const unsub = getOrders(restaurantId, (rows) => {
        try {
          setOrders(Array.isArray(rows) ? rows : []);
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('[useRestaurantOrders] onData', e);
          setOrders([]);
          setLoading(false);
          setError('parse');
        }
      });
      return () => unsub();
    } catch (e) {
      console.error('[useRestaurantOrders]', e);
      setOrders([]);
      setLoading(false);
      setError('subscribe');
    }
  }, [restaurantId]);

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
