import { subscribeAvailableOrders, type DriverOrder } from '../services/driverService';
import { useEffect, useState } from 'react';

export function useAvailableOrders() {
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAvailableOrders((rows) => {
      setOrders(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { orders, loading };
}
