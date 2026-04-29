import {
  subscribeDriverAssignedOrders,
  subscribeRestaurantOrders,
  type RestaurantOrderDoc,
} from '@/services/restaurantDashboard';
import { useEffect, useState } from 'react';

export function useRestaurantOrders(restaurantId: string | null | undefined) {
  const [orders, setOrders] = useState<RestaurantOrderDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeRestaurantOrders(restaurantId, (rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  return { orders, loading };
}

export function useDriverOrders(driverId: string | null | undefined) {
  const [orders, setOrders] = useState<RestaurantOrderDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeDriverAssignedOrders(driverId, (rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [driverId]);

  return { orders, loading };
}
