import { subscribeActiveDelivery, type ActiveDelivery } from '@/services/delivery';
import { useEffect, useMemo, useState } from 'react';

export function useActiveDelivery(orderId: string | null | undefined) {
  const [order, setOrder] = useState<ActiveDelivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = subscribeActiveDelivery(orderId, (row) => {
      if (row && __DEV__) {
        console.log('[ACTIVE DELIVERY SNAPSHOT]', row.id, row.marketplaceCourierStatus, row.updatedAtMs);
      }
      setOrder(row);
      setLoading(false);
      setError(null);
    });
    return () => unsub();
  }, [orderId]);

  return useMemo(
    () => ({
      order,
      loading,
      error,
    }),
    [order, loading, error],
  );
}
