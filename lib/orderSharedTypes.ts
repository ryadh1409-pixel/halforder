/**
 * Shared order lifecycle types/constants — no imports from orderStage,
 * orderPaidState, or orderFulfillmentSignals (breaks require cycles).
 */

export type DerivedOrderStage =
  | 'awaiting_payment'
  | 'awaiting_restaurant'
  | 'preparing'
  | 'driver_assignment'
  | 'driver_assigned'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

/** Monotonic lifecycle rank — higher means further along fulfillment. */
export const ORDER_STAGE_RANK: Record<DerivedOrderStage, number> = {
  awaiting_payment: 0,
  awaiting_restaurant: 1,
  preparing: 2,
  driver_assignment: 3,
  driver_assigned: 4,
  picked_up: 5,
  delivered: 6,
  cancelled: 7,
};

/** Monotonic kitchen/courier status rank (higher = further along fulfillment). */
export const ORDER_STAGE_PRIORITY: Record<string, number> = {
  awaiting_payment: 0,
  pending_payment: 0,
  payment_processing: 0,
  payment_failed: 0,
  unpaid: 0,
  pending: 1,
  payment_confirmed: 1,
  pending_driver: 1,
  accepted: 2,
  restaurant_accepted: 2,
  preparing: 3,
  ready: 4,
  ready_for_pickup: 4,
  driver_assigned: 4,
  driver_accepted: 4,
  arriving_restaurant: 4,
  picked_up_pending: 4,
  heading_to_restaurant: 4,
  waiting_driver: 4,
  picked_up: 5,
  on_the_way: 5,
  near_customer: 5,
  arrived_customer: 5,
  delivered: 6,
  completed: 6,
  cancelled: 100,
  rejected: 100,
  expired: 100,
};

export function compareOrderStage(
  a: DerivedOrderStage,
  b: DerivedOrderStage,
): number {
  return ORDER_STAGE_RANK[a] - ORDER_STAGE_RANK[b];
}

export type OrderStageInput = {
  id?: string;
  status?: unknown;
  paymentStatus?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  driverName?: unknown;
  pickedUpAt?: unknown;
  pickedUpAtMs?: number | null;
  preparedAt?: unknown;
  preparedAtMs?: number | null;
  acceptedAt?: unknown;
  acceptedAtMs?: number | null;
  readyAt?: unknown;
  deliveredAt?: unknown;
  deliveredAtMs?: number | null;
  completedAt?: unknown;
  completedAtMs?: number | null;
  cancelledAt?: unknown;
  cancelledAtMs?: number | null;
  updatedAt?: unknown;
  updatedAtMs?: number | null;
};

/** Order `status` after successful payment — restaurant kitchen queue. */
export const POST_PAYMENT_ORDER_STATUS = 'payment_confirmed' as const;

export const PRE_PAYMENT_ORDER_STATUSES = new Set([
  'awaiting_payment',
  'pending_payment',
  'payment_processing',
  'payment_failed',
]);

/** Stages where Stripe/repair must not reset fulfillment (kitchen or courier). */
export const FULFILLED_STATUSES = new Set([
  'accepted',
  'restaurant_accepted',
  'preparing',
  'ready',
  'ready_for_pickup',
  'driver_assigned',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'delivered',
  'completed',
  'cancelled',
]);

/** @deprecated Use {@link FULFILLED_STATUSES} — kept for imports that reference kitchen-only name. */
export const FULFILLED_KITCHEN_STATUSES = FULFILLED_STATUSES;

export type OrderPaidStateInput = {
  status?: unknown;
  paymentStatus?: unknown;
  deliveryStatus?: unknown;
  deliveryType?: unknown;
};

export function orderStatusString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function orderPaymentStatusString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isOrderFulfilledForPaidPatch(order: OrderPaidStateInput): boolean {
  const status = orderStatusString(order.status).toLowerCase();
  if (FULFILLED_STATUSES.has(status)) {
    return true;
  }
  const courier = orderStatusString(order.deliveryStatus).toLowerCase();
  return FULFILLED_STATUSES.has(courier);
}
