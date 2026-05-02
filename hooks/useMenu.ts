import { getFoodItems, type FoodItem } from '../services/foodService';
import { useEffect, useState } from 'react';

export function useMenu(restaurantId: string | null | undefined) {
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = getFoodItems(restaurantId, (rows) => {
      setItems(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [restaurantId]);

  return { items, loading };
}
