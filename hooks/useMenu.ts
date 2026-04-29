import {
  subscribeRestaurantMenuItems,
  type MenuItemDoc,
} from '@/services/restaurantDashboard';
import { useEffect, useState } from 'react';

export function useMenu(restaurantId: string | null | undefined) {
  const [items, setItems] = useState<MenuItemDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeRestaurantMenuItems(restaurantId, (rows) => {
      setItems(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  return { items, loading };
}
