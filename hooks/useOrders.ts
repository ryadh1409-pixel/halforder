import {
  getOrders,
  type RestaurantOrder,
} from '../services/orderService';
import { useEffect, useState } from 'react';

export function useRestaurantOrders(restaurantId: string | null | undefined) {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = getOrders(restaurantId, (rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  return { orders, loading };
}
