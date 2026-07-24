/**
 * Admin-controlled promotional campaign badges.
 * Stored on Firestore as:
 *   - `promotionBadge` (legacy primary / first badge)
 *   - `promotionBadges` (string[] of active badge values)
 *   - `promotionDestinations` ({ home, menu, swipe, listing, featured })
 */

export type PromotionBadgeValue =
  | 'none'
  | 'most_ordered'
  | 'great_price'
  | 'free_delivery'
  | 'free_service_fee'
  | 'staff_pick'
  | 'new'
  | 'limited_time';

export type PromotionDestinationKey =
  | 'home'
  | 'menu'
  | 'swipe'
  | 'listing'
  | 'featured';

export type PromotionDestinations = Record<PromotionDestinationKey, boolean>;

export const DEFAULT_PROMOTION_DESTINATIONS: PromotionDestinations = {
  home: true,
  menu: true,
  swipe: true,
  listing: true,
  featured: true,
};

export const PROMOTION_DESTINATION_OPTIONS: ReadonlyArray<{
  key: PromotionDestinationKey;
  label: string;
}> = [
  { key: 'home', label: 'Home' },
  { key: 'listing', label: 'Restaurant Listing' },
  { key: 'menu', label: 'Restaurant Menu' },
  { key: 'swipe', label: 'Swipe Cards' },
  { key: 'featured', label: 'Featured Section' },
] as const;

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
  {
    value: 'free_delivery',
    label: '🚚 Free Delivery',
    radioLabel: '🚚 Free Delivery',
  },
  {
    value: 'free_service_fee',
    label: '💸 Free Service Fee',
    radioLabel: '💸 Free Service Fee',
  },
  {
    value: 'staff_pick',
    label: '⭐ Staff Pick',
    radioLabel: '⭐ Staff Pick',
  },
  {
    value: 'new',
    label: '🆕 New',
    radioLabel: '🆕 New',
  },
  {
    value: 'limited_time',
    label: '⚡ Limited Time',
    radioLabel: '⚡ Limited Time',
  },
] as const;

export const PROMOTION_BADGE_COLORS: Record<
  Exclude<PromotionBadgeValue, 'none'>,
  string
> = {
  most_ordered: '#A855F7',
  great_price: '#22C55E',
  free_delivery: '#0EA5E9',
  free_service_fee: '#F59E0B',
  staff_pick: '#EAB308',
  new: '#EC4899',
  limited_time: '#EF4444',
};

const BADGE_ALIASES: Record<string, PromotionBadgeValue> = {
  none: 'none',
  '': 'none',
  most_ordered: 'most_ordered',
  'most ordered': 'most_ordered',
  great_price: 'great_price',
  'great price': 'great_price',
  free_delivery: 'free_delivery',
  'free delivery': 'free_delivery',
  free_service_fee: 'free_service_fee',
  'free service fee': 'free_service_fee',
  staff_pick: 'staff_pick',
  'staff pick': 'staff_pick',
  new: 'new',
  limited_time: 'limited_time',
  'limited time': 'limited_time',
};

export function parsePromotionBadge(raw: unknown): PromotionBadgeValue {
  if (typeof raw !== 'string') return 'none';
  const v = raw.trim().toLowerCase();
  if (v in BADGE_ALIASES) return BADGE_ALIASES[v]!;
  if (v.includes('most ordered')) return 'most_ordered';
  if (v.includes('great price')) return 'great_price';
  if (v.includes('free delivery')) return 'free_delivery';
  if (v.includes('free service')) return 'free_service_fee';
  if (v.includes('staff pick')) return 'staff_pick';
  if (v === 'new' || v.includes('🆕')) return 'new';
  if (v.includes('limited time')) return 'limited_time';
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

/** Active badge list from a Firestore document (supports legacy single field). */
export function promotionBadgesFromData(
  data: Record<string, unknown> | null | undefined,
): Exclude<PromotionBadgeValue, 'none'>[] {
  if (!data) return [];
  const out: Exclude<PromotionBadgeValue, 'none'>[] = [];
  const push = (raw: unknown) => {
    const parsed = parsePromotionBadge(raw);
    if (parsed !== 'none' && !out.includes(parsed)) out.push(parsed);
  };

  if (Array.isArray(data.promotionBadges)) {
    for (const item of data.promotionBadges) push(item);
  }
  if ('promotionBadge' in data) push(data.promotionBadge);
  return out;
}

export function promotionBadgeFromData(
  data: Record<string, unknown> | null | undefined,
): PromotionBadgeValue {
  const list = promotionBadgesFromData(data);
  return list[0] ?? 'none';
}

export function promotionBadgeDisplayFromData(
  data: Record<string, unknown> | null | undefined,
): string | null {
  return promotionBadgeLabel(promotionBadgeFromData(data));
}

export function promotionBadgeLabelsFromData(
  data: Record<string, unknown> | null | undefined,
): string[] {
  return promotionBadgesFromData(data)
    .map((v) => promotionBadgeLabel(v))
    .filter((v): v is string => Boolean(v));
}

export function parsePromotionDestinations(
  raw: unknown,
): PromotionDestinations {
  const base = { ...DEFAULT_PROMOTION_DESTINATIONS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as PromotionDestinationKey[]) {
    if (typeof o[key] === 'boolean') base[key] = o[key] as boolean;
  }
  return base;
}

export function promotionDestinationsFromData(
  data: Record<string, unknown> | null | undefined,
): PromotionDestinations {
  if (!data) return { ...DEFAULT_PROMOTION_DESTINATIONS };
  if ('promotionDestinations' in data) {
    return parsePromotionDestinations(data.promotionDestinations);
  }
  return { ...DEFAULT_PROMOTION_DESTINATIONS };
}

export function promotionVisibleOn(
  data: Record<string, unknown> | null | undefined,
  destination: PromotionDestinationKey,
): boolean {
  const badges = promotionBadgesFromData(data);
  if (badges.length === 0) return false;
  return promotionDestinationsFromData(data)[destination] === true;
}

export function promotionLabelsForDestination(
  data: Record<string, unknown> | null | undefined,
  destination: PromotionDestinationKey,
): string[] {
  if (!promotionVisibleOn(data, destination)) return [];
  return promotionBadgeLabelsFromData(data);
}

export function restaurantPromoWaivesDeliveryFee(
  data: Record<string, unknown> | null | undefined,
): boolean {
  return promotionBadgesFromData(data).includes('free_delivery');
}

export function restaurantPromoWaivesServiceFee(
  data: Record<string, unknown> | null | undefined,
): boolean {
  return promotionBadgesFromData(data).includes('free_service_fee');
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

export function normalizePromotionBadges(
  values: ReadonlyArray<PromotionBadgeValue | string | null | undefined>,
): Exclude<PromotionBadgeValue, 'none'>[] {
  const out: Exclude<PromotionBadgeValue, 'none'>[] = [];
  for (const value of values) {
    const parsed = parsePromotionBadge(value);
    if (parsed !== 'none' && !out.includes(parsed)) out.push(parsed);
  }
  return out;
}
