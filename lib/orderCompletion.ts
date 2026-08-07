import { isCompletedOrder } from '@/constants/orderStatus';

/** Single source of truth for marketplace order completion (all roles). */
export type OrderCompletionFields = {
  status?: unknown;
  deliveryStatus?: unknown;
};

export function normOrderField(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Order is complete when kitchen status OR courier status maps to a terminal
 * completed state. Delegates to the canonical COMPLETED_ORDER_STATUSES set in
 * constants/orderStatus so that all classification logic stays in sync.
 * No other flags (timestamps, archive, earnings) participate in completion detection.
 */
export function isOrderCompleted(
  order: OrderCompletionFields | null | undefined,
): boolean {
  if (!order) return false;
  const status = normOrderField(order.status);
  const courier = normOrderField(order.deliveryStatus);
  // isCompletedOrder covers: 'completed', 'delivered', 'delivery_completed',
  // 'delivery_confirmed', 'order_delivered', 'order_completed', 'finished', etc.
  return isCompletedOrder(status) || isCompletedOrder(courier);
}
