import { extractCoords } from '@/lib/location/extractCoords';
import { extractRestaurantCoords as extractRestaurantCoordsFromDelivery } from '@/lib/location/restaurantDeliveryLocation';
import { haversineDistanceKm } from '@/lib/haversine';

export type DeliveryMode = 'delivery' | 'pickup' | 'group';

export type RatingDisplay =
  | { kind: 'rated'; rating: number; reviewCount: number }
  | { kind: 'new' };

export type FeeEstimate = {
  /** CAD dollars, when known */
  amount: number | null;
  label: string;
};

const ONTARIO_TZ = 'America/Toronto';

/** CAD — always two decimals (Uber Eats style). */
export function formatCad(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function roundCad(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function pickReviewCount(data: Record<string, unknown>): number {
  if (
    typeof data.reviewsCount === 'number' &&
    Number.isFinite(data.reviewsCount)
  ) {
    return Math.max(0, Math.round(data.reviewsCount));
  }
  if (
    typeof data.reviewCount === 'number' &&
    Number.isFinite(data.reviewCount)
  ) {
    return Math.max(0, Math.round(data.reviewCount));
  }
  if (
    typeof data.totalRatings === 'number' &&
    Number.isFinite(data.totalRatings)
  ) {
    return Math.max(0, Math.round(data.totalRatings));
  }
  return 0;
}

export function pickRatingAverage(
  data: Record<string, unknown>,
  reviewCount: number,
): number | null {
  if (reviewCount <= 0) return null;
  const candidates = [
    data.rating,
    data.ratingAverage,
    data.averageRating,
  ];
  for (const raw of candidates) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.min(5, Math.max(1, raw));
    }
  }
  return null;
}

export function resolveRatingDisplay(
  rating: number | null,
  reviewCount: number,
): RatingDisplay {
  if (reviewCount > 0 && rating != null && rating > 0) {
    return { kind: 'rated', rating, reviewCount };
  }
  return { kind: 'new' };
}

/** Compact line: `4.6 ★ (28)` */
export function formatRatingCompact(
  rating: number,
  reviewCount: number,
): string {
  return `${rating.toFixed(1)} ★ (${reviewCount.toLocaleString('en-CA')})`;
}

/** @see {@link extractRestaurantCoordsFromDelivery} in `restaurantDeliveryLocation.ts` */
export function extractRestaurantCoords(
  data: Record<string, unknown>,
): { lat: number; lng: number } | null {
  return extractRestaurantCoordsFromDelivery(data);
}

export function distanceKmBetween(
  user: unknown,
  restaurant: unknown,
): number | null {
  const u = extractCoords(user);
  const r = extractCoords(restaurant);
  if (!u || !r) return null;
  const km = haversineDistanceKm(u.lat, u.lng, r.lat, r.lng);
  return Number.isFinite(km) && km >= 0 ? km : null;
}

/** Realistic km label for Ontario (no miles). */
export function formatDistanceKm(distanceKm: number | null): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 0.05) return '< 0.1 km';
  return `${distanceKm.toFixed(1)} km`;
}

/** @deprecated Use {@link formatDistanceKm} */
export function formatDistanceMi(distanceKm: number | null): string | null {
  return formatDistanceKm(distanceKm);
}

export function pickFirestoreDeliveryFee(
  data: Record<string, unknown>,
): number | null {
  if (
    typeof data.deliveryFee === 'number' &&
    Number.isFinite(data.deliveryFee)
  ) {
    return Math.max(0, data.deliveryFee);
  }
  return null;
}

export function pickFirestoreServiceFee(
  data: Record<string, unknown>,
): number | null {
  if (
    typeof data.serviceFee === 'number' &&
    Number.isFinite(data.serviceFee)
  ) {
    return Math.max(0, data.serviceFee);
  }
  return null;
}

/**
 * Ontario delivery fee tiers (CAD), before tax.
 * 0–2 km → $0.99–$2.99 · 2–5 km → $2.99–$5.99 · 5+ km → $5.99–$8.99
 */
export function deliveryFeeAmountFromDistanceKm(km: number): number {
  if (km <= 2) {
    const t = km / 2;
    return roundCad(0.99 + t * (2.99 - 0.99));
  }
  if (km <= 5) {
    const t = (km - 2) / 3;
    return roundCad(2.99 + t * (5.99 - 2.99));
  }
  const t = Math.min(1, (km - 5) / 8);
  return roundCad(5.99 + t * (8.99 - 5.99));
}

export function calculateDeliveryFee(params: {
  mode: DeliveryMode;
  distanceKm: number | null;
  firestoreFee?: number | null;
}): FeeEstimate {
  const { mode, distanceKm, firestoreFee = null } = params;

  if (mode === 'pickup') {
    return { amount: 0, label: 'No delivery fee' };
  }

  if (firestoreFee != null) {
    if (firestoreFee <= 0) {
      return { amount: 0, label: 'Free delivery' };
    }
    return { amount: firestoreFee, label: formatCad(firestoreFee) };
  }

  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { amount: null, label: 'Calculated at checkout' };
  }

  const amount = deliveryFeeAmountFromDistanceKm(distanceKm);
  return { amount, label: formatCad(amount) };
}

/**
 * Ontario service fee (CAD): small orders $0.99–$2.49; larger orders 5–10% capped.
 */
export function calculateServiceFee(params: {
  subtotal: number;
  firestoreFee?: number | null;
}): FeeEstimate {
  const { subtotal, firestoreFee = null } = params;

  if (firestoreFee != null) {
    return {
      amount: firestoreFee,
      label: firestoreFee <= 0 ? '$0.00' : formatCad(firestoreFee),
    };
  }

  if (subtotal <= 0) {
    return { amount: 1.49, label: formatCad(1.49) };
  }

  let amount: number;
  if (subtotal < 20) {
    const t = subtotal / 20;
    amount = roundCad(0.99 + t * (2.49 - 0.99));
  } else if (subtotal < 45) {
    amount = roundCad(Math.min(3.49, Math.max(2.29, subtotal * 0.06)));
  } else {
    amount = roundCad(Math.min(6.99, Math.max(2.49, subtotal * 0.08)));
  }

  return { amount, label: formatCad(amount) };
}

/** Toronto / Ontario rush windows (local time). */
export function isOntarioBusyHour(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ONTARIO_TZ,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const dayIndex: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'weekday') {
      weekday = dayIndex[p.value] ?? 0;
    }
    if (p.type === 'hour') hour = Number(p.value);
    if (p.type === 'minute') minute = Number(p.value);
  }

  const mins = hour * 60 + minute;
  const weekend = weekday === 0 || weekday === 6;

  if (weekend) {
    return mins >= 11 * 60 && mins <= 22 * 60;
  }
  const lunch = mins >= 11 * 60 + 30 && mins <= 14 * 60;
  const dinner = mins >= 17 * 60 + 30 && mins <= 21 * 60 + 30;
  return lunch || dinner;
}

/**
 * Realistic Ontario ETAs — not ultra-fast.
 */
export function calculateETA(params: {
  mode: DeliveryMode;
  distanceKm: number | null;
  busy?: boolean;
}): string {
  const { mode, distanceKm, busy = isOntarioBusyHour() } = params;

  if (mode === 'pickup') {
    return '10–20 min';
  }

  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return 'ETA unavailable';
  }

  if (busy) {
    return '35–55 min';
  }

  if (mode === 'group') {
    if (distanceKm < 2) return '20–35 min';
    if (distanceKm < 5) return '30–45 min';
    return '35–50 min';
  }

  if (distanceKm < 2) return '15–25 min';
  if (distanceKm < 5) return '25–40 min';
  return '30–45 min';
}

/** @deprecated Use {@link calculateDeliveryFee} */
export function resolveDeliveryFeeLabel(
  mode: DeliveryMode,
  distanceKm: number | null,
  firestoreFee: number | null,
): string {
  return calculateDeliveryFee({ mode, distanceKm, firestoreFee }).label;
}

/** @deprecated Use {@link calculateETA} */
export function resolveEtaLabel(
  mode: DeliveryMode,
  distanceKm: number | null,
): string {
  return calculateETA({ mode, distanceKm });
}

function docCreatedAtMs(data: Record<string, unknown>): number | null {
  const raw = data.createdAt;
  if (!raw || typeof raw !== 'object') return null;
  if (
    'toMillis' in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (
    'seconds' in raw &&
    typeof (raw as { seconds: number }).seconds === 'number'
  ) {
    return (raw as { seconds: number }).seconds * 1000;
  }
  return null;
}

import {
  isLegacyNewOnHalfOrderLabel,
  promotionBadgeLabelsFromData,
  promotionVisibleOn,
  type PromotionDestinationKey,
} from '@/lib/promotionBadge';

function normalizePromoText(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;
  if (isLegacyNewOnHalfOrderLabel(raw)) return null;
  if (lower.includes('bogo') || lower.includes('buy 1') || lower.includes('buy one')) {
    return 'Buy 1 Get 1';
  }
  if (lower.includes('free delivery') || lower === 'free') {
    return 'Free delivery';
  }
  return raw.trim();
}

export type PromoContext = {
  reviewCount: number;
  deliveryFeeAmount: number | null;
  isPopularNearby?: boolean;
  menuPromotions: (string | null | undefined)[];
  data: Record<string, unknown>;
  /** When set, only include admin campaign badges if enabled for this surface. */
  destination?: PromotionDestinationKey;
};

/** Only approved promo/status tags — no invented offers. */
export function resolvePromoTags(ctx: PromoContext): string[] {
  const tags: string[] = [];

  // Admin-controlled promotion campaign badges take priority.
  const destination = ctx.destination ?? 'home';
  if (promotionVisibleOn(ctx.data, destination)) {
    for (const label of promotionBadgeLabelsFromData(ctx.data)) {
      if (!tags.includes(label)) tags.push(label);
    }
  }

  const hasFreeDeliveryBadge = tags.some((t) =>
    t.toLowerCase().includes('free delivery'),
  );
  if (
    ctx.deliveryFeeAmount != null &&
    ctx.deliveryFeeAmount <= 0 &&
    !hasFreeDeliveryBadge
  ) {
    tags.push('Free delivery');
  }

  const docPromo =
    (typeof ctx.data.promoLabel === 'string' && ctx.data.promoLabel) ||
    (typeof ctx.data.activePromotion === 'string' && ctx.data.activePromotion) ||
    (typeof ctx.data.promotion === 'string' && ctx.data.promotion) ||
    null;
  if (docPromo) {
    const n = normalizePromoText(docPromo);
    if (n && !tags.includes(n) && !isLegacyNewOnHalfOrderLabel(n)) {
      tags.push(n);
    }
  }

  for (const p of ctx.menuPromotions) {
    if (typeof p !== 'string' || !p.trim()) continue;
    const n = normalizePromoText(p);
    if (n && !tags.includes(n)) tags.push(n);
  }

  if (ctx.isPopularNearby && !tags.includes('Popular nearby')) {
    tags.push('Popular nearby');
  }

  return tags.slice(0, 4);
}

/** First promo tag for compact badge UI. */
export function pickActivePromotion(
  data: Record<string, unknown>,
  menuPromotions: (string | null | undefined)[],
  options?: Partial<PromoContext>,
): string | null {
  const tags = resolvePromoTags({
    data,
    menuPromotions,
    reviewCount: options?.reviewCount ?? pickReviewCount(data),
    deliveryFeeAmount: options?.deliveryFeeAmount ?? null,
    isPopularNearby: options?.isPopularNearby,
    destination: options?.destination ?? 'menu',
  });
  return tags[0] ?? null;
}

/** All destination-filtered promo tags (admin badges + approved tags). */
export function pickActivePromotions(
  data: Record<string, unknown>,
  menuPromotions: (string | null | undefined)[],
  options?: Partial<PromoContext>,
): string[] {
  return resolvePromoTags({
    data,
    menuPromotions,
    reviewCount: options?.reviewCount ?? pickReviewCount(data),
    deliveryFeeAmount: options?.deliveryFeeAmount ?? null,
    isPopularNearby: options?.isPopularNearby,
    destination: options?.destination ?? 'menu',
  });
}

export function resolveStoreStatusLabel(
  data: Record<string, unknown>,
  reviewCount: number,
): string | null {
  if (reviewCount > 0) return null;
  const createdMs = docCreatedAtMs(data);
  if (createdMs != null) {
    const days = (Date.now() - createdMs) / 86_400_000;
    if (days <= 45) return 'Recently added';
  }
  return null;
}

export function resolveStoreStatusSubtext(reviewCount: number): string | null {
  if (reviewCount > 0) return null;
  return 'Be the first to order';
}
