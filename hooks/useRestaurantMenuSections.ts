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
 * Derives horizontal “rails” (Uber Eats style) from live menu + enrichment.
 */
export function useRestaurantMenuSections(items: DisplayMenuItem[]): MenuSectionBuckets {
  return useMemo(() => {
    const open = items.filter((i) => i.available);

    const byPopularity = [...open].sort((a, b) => b.likedPct - a.likedPct);
    const flaggedPopular = open.filter(
      (i) => i.popular || i.tags.some((t) => t.toLowerCase() === 'popular'),
    );
    const popular =
      flaggedPopular.length >= 2
        ? [...flaggedPopular].sort((a, b) => b.likedPct - a.likedPct).slice(0, 10)
        : byPopularity.slice(0, 8);

    const deals = open.filter(
      (i) =>
        Boolean(i.offerLabel) ||
        i.tags.some((t) => ['bogo', 'deal', 'promo'].includes(t.toLowerCase())),
    );

    const recommended = open
      .filter(
        (i) =>
          i.recommended ||
          i.mostLiked ||
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
