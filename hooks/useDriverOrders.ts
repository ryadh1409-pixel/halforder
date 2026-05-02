import { subscribeDriverOrders, type DriverOrder } from '../services/driverService';
import { useEffect, useState } from 'react';

export function useDriverOrders(driverId: string | null | undefined) {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeDriverOrders(driverId, (rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [driverId]);

  return { orders, loading };
}
