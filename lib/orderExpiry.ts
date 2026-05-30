import { MARKETPLACE_CLIENT_EXPIRY_DISABLED } from '@/lib/marketplaceClientFilters';
import { formatOrderTime } from '@/utils/time';
import { safeToMillis } from '@/utils/safeToMillis';

/** Marketplace / driver pool visibility window. */
export const ORDER_EXPIRY_HOURS = 24;

/** Exactly 24 hours in milliseconds — driver hub max order age. */
export const ORDER_EXPIRY_MS = 86400000;

const TWENTY_FOUR_HOURS_MS = ORDER_EXPIRY_MS;

/** Reject ETA minutes / garbage numbers mistaken for timestamps. */
const MIN_PLAUSIBLE_ORDER_MS = Date.UTC(2020, 0, 1);

export type MarketplaceTimestampFields = {
  createdAt?: unknown;
  paidAt?: unknown;
  updatedAt?: unknown;
  readyAt?: unknown;
  acceptedAt?: unknown;
  preparedAt?: unknown;
};

/**
 * Converts Firestore Timestamp, ms, seconds, Date, or ISO string to epoch ms.
 * Returns null for missing or implausibly small values (e.g. ETA minutes).
 */
export function normalizeFirestoreTimestamp(value: unknown): number | null {
  const ms = safeToMillis(value);
  if (ms == null) return null;
  if (ms < MIN_PLAUSIBLE_ORDER_MS) return null;
  return ms;
}

export function resolveCreatedAtMs(createdAt: unknown): number | null {
  return normalizeFirestoreTimestamp(createdAt);
}

const MARKETPLACE_AGE_FIELD_ORDER: (keyof MarketplaceTimestampFields)[] = [
  'createdAt',
  'paidAt',
  'readyAt',
  'acceptedAt',
  'preparedAt',
];

/** Best-effort order age anchor for marketplace expiry (never treat fresh orders as expired). */
export function resolveMarketplaceCreatedAtMs(
  data: MarketplaceTimestampFields,
): number | null {
  for (const field of MARKETPLACE_AGE_FIELD_ORDER) {
    const ms = normalizeFirestoreTimestamp(data[field]);
    if (ms != null) return ms;
  }
  return null;
}

/**
 * True when the order is older than the active marketplace window.
 * Missing timestamps → NOT expired. Future timestamps → NOT expired (warn only).
 */
export function isOrderExpired(
  createdAt: unknown,
  nowMs: number = Date.now(),
  orderId?: string,
): boolean {
  if (MARKETPLACE_CLIENT_EXPIRY_DISABLED) return false;
  const ms = resolveCreatedAtMs(createdAt);
  if (ms == null) return false;
  return isExpiredByNormalizedAge(ms, nowMs, orderId);
}

export function isMarketplaceOrderExpiredByAge(
  data: MarketplaceTimestampFields,
  nowMs: number = Date.now(),
  orderId?: string,
): boolean {
  if (MARKETPLACE_CLIENT_EXPIRY_DISABLED) return false;
  const ms = resolveMarketplaceCreatedAtMs(data);
  if (ms == null) return false;
  return isExpiredByNormalizedAge(ms, nowMs, orderId);
}

function isExpiredByNormalizedAge(
  normalizedCreatedAt: number,
  nowMs: number,
  orderId?: string,
): boolean {
  if (normalizedCreatedAt > nowMs) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[marketplace-invalid-future-date]', {
        orderId,
        normalizedCreatedAt,
        now: nowMs,
      });
    }
    return false;
  }
  const orderAge = nowMs - normalizedCreatedAt;
  return orderAge > TWENTY_FOUR_HOURS_MS;
}

export function getOrderAgeMinutes(
  createdAt: unknown,
  nowMs: number = Date.now(),
): number | null {
  const ms = resolveCreatedAtMs(createdAt) ?? resolveMarketplaceCreatedAtMs({ createdAt });
  if (ms == null) return null;
  if (ms > nowMs) return 0;
  return Math.max(0, Math.floor((nowMs - ms) / 60_000));
}

/**
 * Human label for order cards.
 * Examples: "Placed 3 min ago", "Placed 1 hour ago", "Placed yesterday", "Expired".
 */
export function getHumanOrderAge(
  createdAt: unknown,
  options?: { timeZone?: string; nowMs?: number; fallbackFields?: MarketplaceTimestampFields },
): string {
  const nowMs = options?.nowMs ?? Date.now();
  const ms =
    resolveCreatedAtMs(createdAt)
    ?? (options?.fallbackFields ? resolveMarketplaceCreatedAtMs(options.fallbackFields) : null);
  if (ms == null) return 'Placed just now';

  const ageSource = createdAt ?? options?.fallbackFields;
  if (
    !MARKETPLACE_CLIENT_EXPIRY_DISABLED
    && isMarketplaceOrderExpiredByAge(
      typeof ageSource === 'object' && ageSource !== null
        ? (ageSource as MarketplaceTimestampFields)
        : { createdAt: ageSource },
      nowMs,
    )
  ) {
    return 'Expired';
  }

  const ageMin = Math.floor((nowMs - ms) / 60_000);
  if (ms > nowMs || ageMin < 60) {
    if (ms > nowMs || ageMin <= 1) return 'Placed just now';
    return `Placed ${ageMin} min ago`;
  }

  return `Placed ${formatOrderTime(ms, { timeZone: options?.timeZone, now: nowMs })}`;
}

export function getMarketplaceExpiryCutoffMs(nowMs: number = Date.now()): number {
  return nowMs - ORDER_EXPIRY_MS;
}
