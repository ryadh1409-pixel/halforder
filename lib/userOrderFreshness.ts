import { safeToMillis } from '@/utils/safeToMillis';

export const DAY_MS = 24 * 60 * 60 * 1000;

export type FreshOrderInput = {
  id?: string;
  createdAtMs?: number | null;
  createdAt?: unknown;
  updatedAtMs?: number | null;
  updatedAt?: unknown;
};

/** Normalize every known timestamp shape to epoch ms. */
export function getOrderTimestamp(order: FreshOrderInput): number {
  if (order.createdAtMs != null) {
    const ms = safeToMillis(order.createdAtMs);
    if (ms != null && ms > 0) return ms;
  }

  if (order.createdAt != null) {
    const createdAt = order.createdAt as {
      toMillis?: () => number;
      _seconds?: number;
    };
    try {
      const direct = createdAt.toMillis?.();
      if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) {
        return direct;
      }
    } catch {
      // fall through
    }

    const seconds = createdAt._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }

    const parsed = safeToMillis(order.createdAt);
    if (parsed != null && parsed > 0) return parsed;
  }

  if (order.updatedAtMs != null) {
    const ms = safeToMillis(order.updatedAtMs);
    if (ms != null && ms > 0) return ms;
  }

  if (order.updatedAt != null) {
    const ms = safeToMillis(order.updatedAt);
    if (ms != null && ms > 0) return ms;
  }

  return 0;
}

export function isFreshOrder(order: FreshOrderInput, nowMs: number = Date.now()): boolean {
  const ts = getOrderTimestamp(order);
  if (!ts) return false;
  return nowMs - ts <= DAY_MS;
}

/** Compact relative age — `Just now`, `45m ago`, `3h ago`, `23h ago`. */
export function formatProfileOrderAge(
  ts: number | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return 'Just now';
  const ageMs = nowMs - ts;
  if (ageMs < 0) return 'Just now';

  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return 'Just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

/** Time until the 24h window closes — `Expires in 20m`, `Expires in 3h`. */
export function formatOrderExpiresIn(
  ts: number | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null;

  const remainingMs = DAY_MS - (nowMs - ts);
  if (remainingMs <= 0) return null;

  const totalMin = Math.ceil(remainingMs / (60 * 1000));
  if (totalMin < 60) return `Expires in ${totalMin}m`;

  const hr = Math.floor(totalMin / 60);
  return `Expires in ${hr}h`;
}

export type BuildFreshProfileOrdersOptions = {
  debug?: boolean;
  nowMs?: number;
};

/** Single source of truth: normalize → filter → sort newest first. */
export function buildFreshProfileOrders<T extends FreshOrderInput & { id?: string }>(
  orders: T[],
  options?: BuildFreshProfileOrdersOptions,
): T[] {
  const nowMs = options?.nowMs ?? Date.now();
  const freshOrders: T[] = [];

  for (const order of orders) {
    const ts = getOrderTimestamp(order);

    if (options?.debug) {
      console.log('[profile-order-age]', {
        id: order.id,
        ts,
        ageHours: ts ? ((nowMs - ts) / (1000 * 60 * 60)).toFixed(2) : 'n/a',
      });
    }

    if (!ts) {
      // Keep rows from the profile listener when createdAt is missing on the client parse.
      freshOrders.push(order);
      continue;
    }

    if (nowMs - ts <= DAY_MS) {
      freshOrders.push(order);
    } else if (options?.debug) {
      console.log('[profile-order-filtered]', order.id, ts);
    }
  }

  freshOrders.sort((a, b) => getOrderTimestamp(b) - getOrderTimestamp(a));

  if (options?.debug) {
    console.log('[profile-orders]', {
      total: orders.length,
      fresh: freshOrders.length,
    });
  }

  return freshOrders;
}

/** @deprecated Use getOrderTimestamp */
export function resolveProfileOrderCreatedAtMs(order: FreshOrderInput): number {
  return getOrderTimestamp(order);
}
