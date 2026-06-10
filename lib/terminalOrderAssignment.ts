import { isOrderCompleted, normOrderField } from '@/lib/orderCompletion';

/** Block driver claim/assign when order is already finalized. */
export function isOrderTerminalForAssignment(
  order: Record<string, unknown> | null | undefined,
): boolean {
  if (!order) return false;
  if (isOrderCompleted(order)) return true;
  if (order.earningsRecorded === true) return true;
  if (order.marketplaceArchived === true) {
    const courier = normOrderField(order.deliveryStatus);
    if (courier === 'delivered' || courier === 'completed') return true;
  }
  const kitchen = normOrderField(order.status);
  if (kitchen === 'cancelled' || kitchen === 'rejected' || kitchen === 'expired') {
    return true;
  }
  return false;
}
