import { getFoodItems, type FoodItem } from '../services/foodService';
import { useEffect, useMemo, useState } from 'react';

export function useMenu(restaurantId: string | null | undefined) {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const unsub = getFoodItems(restaurantId, (rows) => {
        try {
          setItems(Array.isArray(rows) ? rows : []);
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('[useMenu] onData', e);
          setItems([]);
          setLoading(false);
          setError('parse');
        }
      });
      return () => unsub();
    } catch (e) {
      console.error('[useMenu]', e);
      setItems([]);
      setLoading(false);
      setError('subscribe');
    }
  }, [restaurantId]);

  return useMemo(
    () => ({
      items: items ?? [],
      loading,
      stale: false,
      error,
    }),
    [items, loading, error],
  );
}
