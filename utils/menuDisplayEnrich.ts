import type { FoodItem } from '@/services/foodService';

export type DisplayMenuItem = FoodItem & {
  /** Only when set on the menu item in Firestore (`promotion`). */
  offerLabel: string | null;
  shortIngredients: string;
};

/** Stable fingerprint for distinguishing cart rows with modifiers. */
export function cartFingerprint(signature: string): string {
  let h = 0;
  for (let i = 0; i < signature.length; i += 1) {
    h = (h << 5) - h + signature.charCodeAt(i);
  }
  return String(Math.abs(h));
}

/** Adds display-only fields from real menu data — no synthetic popularity or offers. */
export function enrichMenuItem(item: FoodItem): DisplayMenuItem {
  const offerLabel =
    typeof item.promotion === 'string' && item.promotion.trim()
      ? item.promotion.trim()
      : null;
  const shortIngredients = item.description?.trim().slice(0, 72) ?? '';
  return {
    ...item,
    offerLabel,
    shortIngredients,
  };
}

export function defaultCategoriesFromItems(items: FoodItem[]): string[] {
  const fromData = [
    ...new Set(items.map((i) => (i.category || '').trim()).filter(Boolean)),
  ];
  const popular = 'Popular';
  const merged = [popular, ...fromData.filter((c) => c !== popular)];
  return merged.length ? merged : [popular, 'Menu'];
}

export function itemsForCategory(
  items: DisplayMenuItem[],
  category: string,
): DisplayMenuItem[] {
  if (category === 'Popular') {
    const flagged = items.filter(
      (i) => i.popular || i.tags.some((t) => t.toLowerCase() === 'popular'),
    );
    if (flagged.length >= 2) return flagged.slice(0, 10);
    return items.slice(0, Math.min(8, items.length));
  }
  return items.filter((i) => (i.category || 'Menu') === category);
}
