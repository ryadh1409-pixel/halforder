import type { RestaurantOrder } from '@/services/orderService';

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Stable listener fingerprint for React state deduplication. */
export function restaurantOrderSnapshotFingerprint(order: {
  status?: unknown;
  deliveryStatus?: unknown;
  paymentStatus?: unknown;
  updatedAtMs?: number | null;
}): string {
  return [
    norm(order.status),
    norm(order.deliveryStatus),
    norm(order.paymentStatus),
    String(order.updatedAtMs ?? 0),
  ].join('|');
}

/** Skip React updates when the active-order list is unchanged. */
export function areRestaurantOrderListsEqual(
  prev: RestaurantOrder[],
  next: RestaurantOrder[],
): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i].id !== next[i].id) return false;
    if (
      restaurantOrderSnapshotFingerprint(prev[i]) !==
      restaurantOrderSnapshotFingerprint(next[i])
    ) {
      return false;
    }
  }
  return true;
}
