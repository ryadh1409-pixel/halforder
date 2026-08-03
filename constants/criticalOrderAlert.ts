/** Shared names for critical order push/local notification sound + Android channel. */
export const CRITICAL_ORDER_SOUND_NAME = 'order_critical_alert.wav';
export const CRITICAL_ORDER_CHANNEL_ID = 'critical_orders';

export type OrderAlertRole = 'admin' | 'restaurant' | 'driver';
export type OrderAlertEvent =
  | 'new_order'
  | 'ready_for_pickup'
  | 'new_delivery_available';

export function criticalOrderAlertKey(
  role: OrderAlertRole,
  event: OrderAlertEvent,
  orderId: string,
): string {
  return `${role}:${event}:${orderId.trim()}`;
}
