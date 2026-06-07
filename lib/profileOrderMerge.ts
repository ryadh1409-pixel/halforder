import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';

/** Prefer completed / forward courier progress when the same orderId appears in multiple queries. */
export function pickBetterProfileOrder(
  previous: ProfileOrderRow,
  incoming: ProfileOrderRow,
): ProfileOrderRow {
  const prevCompleted = isOrderCompleted(previous);
  const nextCompleted = isOrderCompleted(incoming);
  if (prevCompleted && !nextCompleted) return previous;
  if (nextCompleted && !prevCompleted) return incoming;

  const prevRank = resolveCustomerCourierRank(previous);
  const nextRank = resolveCustomerCourierRank(incoming);
  if (nextRank > prevRank) return incoming;
  if (prevRank > nextRank) return previous;

  const prevUpdated = previous.updatedAtMs ?? 0;
  const nextUpdated = incoming.updatedAtMs ?? 0;
  if (nextUpdated > prevUpdated) return incoming;
  if (prevUpdated > nextUpdated) return previous;

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
