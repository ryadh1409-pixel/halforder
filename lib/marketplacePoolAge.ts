import { ORDER_EXPIRY_MS, normalizeFirestoreTimestamp } from '@/lib/orderExpiry';

/** True when pool/order `createdAt` is within the driver hub visibility window (24h). */
export function isWithinDriverPoolAgeWindow(
  createdAt: unknown,
  createdAtMs?: number | null,
  nowMs: number = Date.now(),
): boolean {
  const ms = createdAtMs ?? normalizeFirestoreTimestamp(createdAt);
  if (ms == null) return true;
  if (ms > nowMs) return true;
  return nowMs - ms <= ORDER_EXPIRY_MS;
}

/** Defensive client filter — hide pool rows older than 24h. */
export function isDriverPoolRowStale(
  createdAt: unknown,
  createdAtMs?: number | null,
  nowMs: number = Date.now(),
): boolean {
  return !isWithinDriverPoolAgeWindow(createdAt, createdAtMs, nowMs);
}
