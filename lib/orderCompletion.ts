/** Single source of truth for marketplace order completion (all roles). */
export type OrderCompletionFields = {
  status?: unknown;
  deliveryStatus?: unknown;
};

export function normOrderField(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Order is complete when kitchen status is `completed` OR courier status is `delivered`.
 * No other flags (timestamps, archive, earnings) participate in completion detection.
 */
export function isOrderCompleted(
  order: OrderCompletionFields | null | undefined,
): boolean {
  if (!order) return false;
  const status = normOrderField(order.status);
  const courier = normOrderField(order.deliveryStatus);
  return status === 'completed' || courier === 'delivered';
}
