/**
 * Admin-controlled promotional badge for restaurants and food cards.
 * Values stored on Firestore as `promotionBadge`.
 */

export type PromotionBadgeValue = 'none' | 'most_ordered' | 'great_price';

export const PROMOTION_BADGE_OPTIONS: ReadonlyArray<{
  value: PromotionBadgeValue;
  label: string;
  radioLabel: string;
}> = [
  { value: 'none', label: '', radioLabel: 'None' },
  {
    value: 'most_ordered',
    label: '🔥 Most Ordered',
    radioLabel: '🔥 Most Ordered',
  },
  {
    value: 'great_price',
    label: '💰 Great Price',
    radioLabel: '💰 Great Price',
  },
] as const;

export const PROMOTION_BADGE_COLORS: Record<
  Exclude<PromotionBadgeValue, 'none'>,
  string
> = {
  most_ordered: '#FF6B35',
  great_price: '#22C55E',
};

export function parsePromotionBadge(raw: unknown): PromotionBadgeValue {
  if (typeof raw !== 'string') return 'none';
  const v = raw.trim().toLowerCase();
  if (v === 'most_ordered' || v === 'most ordered') return 'most_ordered';
  if (v === 'great_price' || v === 'great price') return 'great_price';
  if (v === 'none' || v === '') return 'none';
  // Legacy / display-string fallbacks
  if (v.includes('most ordered')) return 'most_ordered';
  if (v.includes('great price')) return 'great_price';
  return 'none';
}

export function promotionBadgeLabel(
  value: PromotionBadgeValue | null | undefined,
): string | null {
  if (!value || value === 'none') return null;
  const opt = PROMOTION_BADGE_OPTIONS.find((o) => o.value === value);
  return opt?.label || null;
}

export function promotionBadgeColor(
  value: PromotionBadgeValue | null | undefined,
): string | null {
  if (!value || value === 'none') return null;
  return PROMOTION_BADGE_COLORS[value] ?? null;
}

/** Resolve badge from a Firestore document (restaurants or adminFoodShares). */
export function promotionBadgeFromData(
  data: Record<string, unknown> | null | undefined,
): PromotionBadgeValue {
  if (!data) return 'none';
  if ('promotionBadge' in data) {
    return parsePromotionBadge(data.promotionBadge);
  }
  return 'none';
}

export function promotionBadgeDisplayFromData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  return promotionBadgeLabel(promotionBadgeFromData(data));
}

/** Strip legacy auto tag if it ever appears in stored promo strings. */
export function isLegacyNewOnHalfOrderLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'new on halforder';
}

/** True when label is an admin promotion badge display string. */
export function isAdminPromotionBadgeLabel(
  label: string | null | undefined,
): boolean {
  if (!label) return false;
  return parsePromotionBadge(label) !== 'none';
}
