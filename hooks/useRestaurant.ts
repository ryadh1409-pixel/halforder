import {
  subscribeRestaurantByOwner,
  type RestaurantDoc,
} from '@/services/restaurantDashboard';
import { useEffect, useState } from 'react';

export function useRestaurant(ownerId: string | null | undefined) {
  const [restaurant, setRestaurant] = useState<RestaurantDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) {
      setRestaurant(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeRestaurantByOwner(ownerId, (doc) => {
      setRestaurant(doc);
      setLoading(false);
    });
    return () => unsub();
  }, [ownerId]);

  return { restaurant, loading };
}
