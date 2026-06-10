/**
 * Monotonic delivery lifecycle rank for customer order snapshot freshness.
 * Rank wins over `updatedAt` — serverTimestamp() may briefly resolve to null.
 */
export const DELIVERY_STAGE_RANK: Record<string, number> = {
  pending: 0,
  payment_confirmed: 0,
  driver_assigned: 1,
  ready_for_pickup: 2,
  picked_up: 3,
  delivered: 4,
  completed: 4,
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function rankForField(value: unknown): number {
  const key = norm(value);
  if (!key) return -1;
  return DELIVERY_STAGE_RANK[key] ?? -1;
}

/** Best rank from `status` and `deliveryStatus` (whichever is further along). */
export function resolveDeliveryStageRank(raw: {
  status?: unknown;
  deliveryStatus?: unknown;
}): number {
  const statusRank = rankForField(raw.status);
  const deliveryRank = rankForField(raw.deliveryStatus);
  return Math.max(statusRank, deliveryRank, 0);
}

export function isDeliveryStageRegression(previousRank: number, nextRank: number): boolean {
  return nextRank < previousRank;
}
