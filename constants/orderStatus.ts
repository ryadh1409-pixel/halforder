/**
 * Customer-facing order grouping — Firestore field **`status`** only.
 * Do not key list/track UI off `orderStatus`, `state`, or generic `progress`.
 */

/** User-visible active lifecycle (Part 1). */
export const USER_ACTIVE_ORDER_STATUSES = [
  'awaiting_payment',
  'payment_processing',
  'payment_confirmed',
  'finding_driver',
  'pending_driver',
  'matched',
  'order_placed',
  'restaurant_accepted',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'on_the_way',
  'arrived_nearby',
] as const;

/** Backend / legacy aliases resolved into Active via `ACTIVE_ORDER_STATUSES`. */
export const ACTIVE_ORDER_STATUS_ALIASES = [
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

/** Full active set for list filtering & badges. */
export const ACTIVE_ORDER_STATUSES = [
  ...USER_ACTIVE_ORDER_STATUSES,
  ...ACTIVE_ORDER_STATUS_ALIASES,
] as const;

export type ActiveOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number];

export const COMPLETED_ORDER_STATUSES = ['delivered'] as const;

/** Older swipe/half-order terminal status — bucketed as Completed in lists. */
export const LEGACY_COMPLETED_ORDER_STATUSES = ['completed'] as const;

export type CompletedOrderStatus =
  | (typeof COMPLETED_ORDER_STATUSES)[number]
  | (typeof LEGACY_COMPLETED_ORDER_STATUSES)[number];

export const CANCELLED_ORDER_STATUSES = ['cancelled'] as const;

export const SIDE_CANCELLED_ORDER_STATUSES = ['expired', 'rejected'] as const;

export type CancelledOrderStatus =
  | (typeof CANCELLED_ORDER_STATUSES)[number]
  | (typeof SIDE_CANCELLED_ORDER_STATUSES)[number];

export type OrderListSection = 'active' | 'completed' | 'cancelled';

const ACTIVE_SET = new Set<string>(ACTIVE_ORDER_STATUSES);
const COMPLETED_SET = new Set<string>([
  ...COMPLETED_ORDER_STATUSES,
  ...LEGACY_COMPLETED_ORDER_STATUSES,
]);
const CANCELLED_SET = new Set<string>([
  ...CANCELLED_ORDER_STATUSES,
  ...SIDE_CANCELLED_ORDER_STATUSES,
]);

export function normalizeOrderStatusRaw(raw: string): string {
  return raw.trim().toLowerCase();
}

export function getOrderListSection(status: string): OrderListSection {
  const s = normalizeOrderStatusRaw(status);
  if (!s || s === '—') return 'active';
  if (CANCELLED_SET.has(s)) return 'cancelled';
  if (COMPLETED_SET.has(s)) return 'completed';
  if (ACTIVE_SET.has(s)) return 'active';
  return 'active';
}

export function isActiveOrderStatus(status: string): boolean {
  return getOrderListSection(status) === 'active';
}

export function isCompletedOrderStatus(status: string): boolean {
  return getOrderListSection(status) === 'completed';
}

export function isCancelledOrderStatus(status: string): boolean {
  return getOrderListSection(status) === 'cancelled';
}
