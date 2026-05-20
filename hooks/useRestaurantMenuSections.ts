import { PREMIUM_MENU_KEYWORDS } from '@/services/restaurantMenuService';
import type { FoodItem } from '@/services/foodService';
import type { DisplayMenuItem } from '@/utils/menuDisplayEnrich';
import { useMemo } from 'react';

function categoryMatches(item: FoodItem, keywords: readonly string[]): boolean {
  const blob = `${item.category} ${item.tags.join(' ')}`.toLowerCase();
  return keywords.some((k) => blob.includes(k));
}

export type MenuSectionBuckets = {
  popular: DisplayMenuItem[];
  deals: DisplayMenuItem[];
  recommended: DisplayMenuItem[];
  drinks: DisplayMenuItem[];
  desserts: DisplayMenuItem[];
};

/**
 * Horizontal rails from live Firestore menu flags only (no synthetic popularity).
 */
export function useRestaurantMenuSections(items: DisplayMenuItem[]): MenuSectionBuckets {
  return useMemo(() => {
    const open = items.filter((i) => i.available);

    const popular = open
      .filter(
        (i) =>
          i.popular || i.tags.some((t) => t.toLowerCase() === 'popular'),
      )
      .slice(0, 10);

    const deals = open.filter((i) => {
      if (i.offerLabel) return true;
      return i.tags.some((t) => {
        const tag = t.toLowerCase();
        return tag === 'deal' || tag === 'promo' || tag === 'promotion';
      });
    });

    const recommended = open
      .filter(
        (i) =>
          i.recommended ||
          i.tags.some((t) => t.toLowerCase() === 'recommended'),
      )
      .slice(0, 10);

    const drinks = open
      .filter((i) => categoryMatches(i, PREMIUM_MENU_KEYWORDS.drinks))
      .slice(0, 12);
    const desserts = open
      .filter((i) => categoryMatches(i, PREMIUM_MENU_KEYWORDS.desserts))
      .slice(0, 12);

    return { popular, deals, recommended, drinks, desserts };
  }, [items]);
}
