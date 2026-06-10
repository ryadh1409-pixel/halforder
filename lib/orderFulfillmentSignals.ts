import {
  isOrderFulfilledForPaidPatch,
  type OrderPaidStateInput,
} from '@/lib/orderSharedTypes';

function hasTimestamp(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'object' && value !== null && 'seconds' in value) return true;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return true;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  return false;
}

/**
 * True when fulfillment has advanced beyond payment sync — even if `status` lags (stale writer read).
 */
export function hasFulfillmentProgressMarkers(
  order: OrderPaidStateInput & Record<string, unknown>,
): boolean {
  if (
    hasTimestamp(order.acceptedAt) ||
    hasTimestamp(order.preparedAt) ||
    hasTimestamp(order.readyAt) ||
    hasTimestamp(order.pickedUpAt) ||
    hasTimestamp(order.deliveredAt) ||
    hasTimestamp(order.completedAt)
  ) {
    return true;
  }
  return isOrderFulfilledForPaidPatch(order);
}
