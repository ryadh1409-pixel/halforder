import {
  subscribeRestaurantByOwner,
  type RestaurantDoc,
} from '../services/restaurantDashboard';
import { useEffect, useMemo, useState } from 'react';

export function useRestaurant(ownerId: string | null | undefined) {
  const [restaurant, setRestaurant] = useState<RestaurantDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setRestaurant(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const unsub = subscribeRestaurantByOwner(ownerId, (doc) => {
        setRestaurant(doc);
        setLoading(false);
        setError(null);
      });
      return () => unsub();
    } catch (e) {
      console.error('[useRestaurant]', e);
      setRestaurant(null);
      setLoading(false);
      setError('subscribe');
    }
  }, [ownerId]);

  return useMemo(
    () => ({
      restaurant,
      loading,
      stale: false,
      error,
    }),
    [restaurant, loading, error],
  );
}
