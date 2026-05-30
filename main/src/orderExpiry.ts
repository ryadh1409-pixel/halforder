/**
 * Mirror of `lib/orderExpiry.ts` for Cloud Functions.
 */
import {Timestamp} from "firebase-admin/firestore";

export const ORDER_EXPIRY_HOURS = 24;
/** Exactly 24 hours in milliseconds — driver marketplace pool max age. */
export const ORDER_EXPIRY_MS = 86400000;

const TWENTY_FOUR_HOURS_MS = ORDER_EXPIRY_MS;
const MIN_PLAUSIBLE_ORDER_MS = Date.UTC(2020, 0, 1);

export function normalizeFirestoreTimestamp(value: unknown): number | null {
  const ms = timestampToMillis(value);
  if (ms == null) return null;
  if (ms < MIN_PLAUSIBLE_ORDER_MS) return null;
  return ms;
}

export function timestampToMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1e12) return Math.round(value * 1000);
    return Math.round(value);
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const obj = value as {seconds?: number; _seconds?: number; toMillis?: () => number};
    if (typeof obj.toMillis === "function") {
      try {
        return obj.toMillis();
      } catch {
        return null;
      }
    }
    const sec = obj.seconds ?? obj._seconds;
    if (typeof sec === "number" && Number.isFinite(sec)) {
      return Math.floor(sec * 1000);
    }
  }
  return null;
}

export function resolveMarketplaceCreatedAtMs(data: {
  createdAt?: unknown;
  paidAt?: unknown;
  updatedAt?: unknown;
  readyAt?: unknown;
  acceptedAt?: unknown;
  preparedAt?: unknown;
}): number | null {
  const fields: (keyof typeof data)[] = [
    "createdAt",
    "paidAt",
    "readyAt",
    "acceptedAt",
    "preparedAt",
  ];
  for (const field of fields) {
    const ms = normalizeFirestoreTimestamp(data[field]);
    if (ms != null) return ms;
  }
  return null;
}

/** Missing timestamp → not expired (do not block pool sync). */
export function isOrderExpired(
  createdAt: unknown,
  nowMs: number = Date.now(),
  orderId?: string,
): boolean {
  const ms = normalizeFirestoreTimestamp(createdAt);
  if (ms == null) return false;
  return isExpiredByNormalizedAge(ms, nowMs, orderId);
}

export function isMarketplaceOrderExpiredByAge(
  data: {
    createdAt?: unknown;
    paidAt?: unknown;
    updatedAt?: unknown;
    readyAt?: unknown;
    acceptedAt?: unknown;
    preparedAt?: unknown;
  },
  nowMs: number = Date.now(),
  orderId?: string,
): boolean {
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
    console.warn("[marketplace-invalid-future-date]", {
      orderId,
      normalizedCreatedAt,
      now: nowMs,
    });
    return false;
  }
  const orderAge = nowMs - normalizedCreatedAt;
  return orderAge > TWENTY_FOUR_HOURS_MS;
}

export function getMarketplaceExpiryCutoffTimestamp(
  nowMs: number = Date.now(),
): Timestamp {
  return Timestamp.fromMillis(nowMs - ORDER_EXPIRY_MS);
}
