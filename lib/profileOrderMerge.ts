import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';

function resolveProfileOrderUpdatedAtMs(row: ProfileOrderRow): number {
  return Math.max(
    row.updatedAtMs ?? 0,
    row.completedAtMs ?? 0,
    row.deliveredAtMs ?? 0,
  );
}

/**
 * Pick the authoritative row for a duplicate orderId.
 * 1. Terminal completed/delivered always wins
 * 2. Newest `updatedAtMs`
 * 3. Highest delivery stage rank (tiebreaker at equal timestamp)
 */
export function pickBetterProfileOrder(
  previous: ProfileOrderRow,
  incoming: ProfileOrderRow,
): ProfileOrderRow {
  const prevCompleted = isOrderCompleted(previous);
  const nextCompleted = isOrderCompleted(incoming);
  if (prevCompleted && !nextCompleted) return previous;
  if (nextCompleted && !prevCompleted) return incoming;

  const prevUpdated = resolveProfileOrderUpdatedAtMs(previous);
  const nextUpdated = resolveProfileOrderUpdatedAtMs(incoming);
  if (nextUpdated > prevUpdated) return incoming;
  if (prevUpdated > nextUpdated) return previous;

  const prevRank = resolveCustomerCourierRank(previous);
  const nextRank = resolveCustomerCourierRank(incoming);
  if (nextRank > prevRank) return incoming;
  if (prevRank > nextRank) return previous;

  return incoming;
}

export function mergeProfileOrderRowsById(
  existing: ProfileOrderRow[],
  incoming: ProfileOrderRow[],
): ProfileOrderRow[] {
  const byId = new Map<string, ProfileOrderRow>();
  for (const row of existing) {
    byId.set(row.id, row);
  }
  for (const row of incoming) {
    const prev = byId.get(row.id);
    byId.set(row.id, prev ? pickBetterProfileOrder(prev, row) : row);
  }
  return [...byId.values()];
}
