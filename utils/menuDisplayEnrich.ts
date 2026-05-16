import type { FoodItem } from '@/services/foodService';

export type DisplayMenuItem = FoodItem & {
  likedPct: number;
  previouslyOrdered: boolean;
  mostLiked: boolean;
  offerLabel: string | null;
  shortIngredients: string;
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

/** Stable fingerprint for distinguishing cart rows with modifiers. */
export function cartFingerprint(signature: string): string {
  return String(hash(signature));
}

export function enrichMenuItem(item: FoodItem): DisplayMenuItem {
  const h = hash(item.id);
  const likedPct = 88 + (h % 12);
  const previouslyOrdered = h % 5 === 0;
  const mostLiked = h % 7 === 0;
  const offers = ['BOGO', '20% off', 'Free drink', null, null, null];
  const offerLabel = item.promotion ?? offers[h % offers.length];
  const shortIngredients =
    item.description?.trim().slice(0, 72) ||
    'Fresh ingredients · chef-crafted · made to order';
  return {
    ...item,
    likedPct,
    previouslyOrdered,
    mostLiked,
    offerLabel,
    shortIngredients,
  };
}

export function defaultCategoriesFromItems(items: FoodItem[]): string[] {
  const fromData = [...new Set(items.map((i) => (i.category || '').trim()).filter(Boolean))];
  const popular = 'Popular';
  const merged = [popular, ...fromData.filter((c) => c !== popular)];
  return merged.length ? merged : [popular, 'Menu'];
}

export function itemsForCategory(items: DisplayMenuItem[], category: string): DisplayMenuItem[] {
  if (category === 'Popular') {
    return [...items].sort((a, b) => b.likedPct - a.likedPct).slice(0, Math.min(8, items.length));
  }
  return items.filter((i) => (i.category || 'Menu') === category);
}
