/**
 * Centralized order status architecture.
 * Standalone module (no imports) to avoid circular dependency crashes.
 */

export const HALF_ORDER_MATCH_WAIT_MS = 2 * 60 * 1000;

export const ORDER_STATUS = {
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_PROCESSING: 'payment_processing',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  FINDING_DRIVER: 'finding_driver',
  PENDING_DRIVER: 'pending_driver',
  MATCHED: 'matched',
  ORDER_PLACED: 'order_placed',
  RESTAURANT_ACCEPTED: 'restaurant_accepted',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  ON_THE_WAY: 'on_the_way',
  ARRIVED_NEARBY: 'arrived_nearby',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',

  // backward compatibility
  WAITING: 'awaiting_payment',
  ACTIVE: 'matched',
  COMPLETED: 'delivered',
} as const;

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[orderStatus] ORDER_STATUS keys:', Object.keys(ORDER_STATUS).length);
}

export const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.AWAITING_PAYMENT,
  ORDER_STATUS.PAYMENT_PROCESSING,
  ORDER_STATUS.PAYMENT_CONFIRMED,
  ORDER_STATUS.FINDING_DRIVER,
  ORDER_STATUS.PENDING_DRIVER,
  ORDER_STATUS.MATCHED,
  ORDER_STATUS.ORDER_PLACED,
  ORDER_STATUS.RESTAURANT_ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.ON_THE_WAY,
  ORDER_STATUS.ARRIVED_NEARBY,
  // Legacy aliases retained for existing docs.
  'pending',
  'payment_failed',
  'driver_accepted',
  'driver_assigned',
  'arriving_restaurant',
  'picked_up_pending',
  'accepted',
  'ready',
  'waiting',
  'active',
  'open',
  'full',
  'arrived_customer',
] as const;

export const COMPLETED_ORDER_STATUSES = [ORDER_STATUS.DELIVERED, 'completed'] as const;

export const CANCELLED_ORDER_STATUSES = [ORDER_STATUS.CANCELLED, 'expired', 'rejected'] as const;

export type OrderListSection = 'active' | 'completed' | 'cancelled';

const ACTIVE_SET = new Set<string>(ACTIVE_ORDER_STATUSES);
const COMPLETED_SET = new Set<string>(COMPLETED_ORDER_STATUSES);
const CANCELLED_SET = new Set<string>(CANCELLED_ORDER_STATUSES);

export function normalizeOrderStatusRaw(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isActiveOrder(status: string): boolean {
  return ACTIVE_SET.has(normalizeOrderStatusRaw(status));
}

export function isCompletedOrder(status: string): boolean {
  return COMPLETED_SET.has(normalizeOrderStatusRaw(status));
}

export function isCancelledOrder(status: string): boolean {
  return CANCELLED_SET.has(normalizeOrderStatusRaw(status));
}

export function getOrderListSection(status: string): OrderListSection {
  const s = normalizeOrderStatusRaw(status);
  if (!s || s === '—') return 'active';
  if (isCancelledOrder(s)) return 'cancelled';
  if (isCompletedOrder(s)) return 'completed';
  return 'active';
}

// Backward-compatible helper names used by existing screens.
export const isActiveOrderStatus = isActiveOrder;
export const isCompletedOrderStatus = isCompletedOrder;
export const isCancelledOrderStatus = isCancelledOrder;
