import { isOrderCompleted } from '@/lib/orderCompletion';
import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';

export type ProfileOrderLogSource =
  | 'useProfileOrders:query'
  | 'useProfileOrders:merged'
  | 'useProfileOrders:split'
  | 'profile:open';

/** Debug log for every profile-list order row. */
export function logProfileOrder(
  order: ProfileOrderRow,
  source: ProfileOrderLogSource,
  extra?: Record<string, unknown>,
): void {
  console.log('[PROFILE ORDER]', {
    source,
    orderId: order.id,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    paymentStatus: order.paymentStatus,
    createdAtMs: order.createdAtMs,
    updatedAtMs: order.updatedAtMs ?? null,
    completedAtMs: order.completedAtMs ?? null,
    deliveredAtMs: order.deliveredAtMs ?? null,
    completed: isOrderCompleted(order),
    courierRank: resolveCustomerCourierRank(order),
    ...extra,
  });
}

export function logProfileOrderList(
  orders: ProfileOrderRow[],
  source: ProfileOrderLogSource,
  extra?: Record<string, unknown>,
): void {
  for (const order of orders) {
    logProfileOrder(order, source, extra);
  }
}
