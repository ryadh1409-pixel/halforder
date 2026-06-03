import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import { safeToMillis } from '@/utils/safeToMillis';

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

/**
 * Compare canonical stages.
 * @returns negative if `a` is earlier than `b`, positive if later, 0 if equal
 */
export function compareOrderStage(
  a: DerivedOrderStage,
  b: DerivedOrderStage,
): number {
  return ORDER_STAGE_RANK[a] - ORDER_STAGE_RANK[b];
}

export function isOrderStageAtLeast(
  order: OrderStageInput | null | undefined,
  minimum: DerivedOrderStage,
): boolean {
  return compareOrderStage(deriveOrderStage(order), minimum) >= 0;
}

function mergePatchOntoOrder(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): OrderStageInput {
  return {
    ...current,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.paymentStatus !== undefined ? { paymentStatus: patch.paymentStatus } : {}),
    ...(patch.deliveryStatus !== undefined ? { deliveryStatus: patch.deliveryStatus } : {}),
    ...(patch.driverId !== undefined ? { driverId: patch.driverId } : {}),
    ...(patch.assignedDriverId !== undefined
      ? { assignedDriverId: patch.assignedDriverId }
      : {}),
    ...(patch.pickedUpAt !== undefined ? { pickedUpAt: patch.pickedUpAt } : {}),
    ...(patch.pickedUpAtMs !== undefined ? { pickedUpAtMs: patch.pickedUpAtMs as number } : {}),
    ...(patch.deliveredAt !== undefined ? { deliveredAt: patch.deliveredAt } : {}),
    ...(patch.deliveredAtMs !== undefined
      ? { deliveredAtMs: patch.deliveredAtMs as number }
      : {}),
    ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt } : {}),
    ...(patch.cancelledAtMs !== undefined
      ? { cancelledAtMs: patch.cancelledAtMs as number }
      : {}),
  };
}

const PRE_PAYMENT_STATUS_VALUES = new Set([
  'awaiting_payment',
  'pending_payment',
  'payment_processing',
  'payment_failed',
  'unpaid',
]);

const EARLY_COURIER_VALUES = new Set(['pending', '']);

/**
 * Strip patch fields that would move the order backward in the lifecycle.
 * Payment webhooks, repairs, and stale listeners must use this before writing.
 */
export function sanitizeOrderPatchAgainstRegression(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...patch };
  const currentStage = deriveOrderStage(current);
  const merged = mergePatchOntoOrder(current, safe);
  const nextStage = deriveOrderStage(merged);

  if (nextStage === 'cancelled' && currentStage !== 'delivered') {
    return safe;
  }

  if (compareOrderStage(nextStage, currentStage) < 0) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[ORDER STAGE] blocked regression patch', {
        orderId: current.id ?? null,
        currentStage,
        attemptedStage: nextStage,
        patch: safe,
      });
    }
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.paymentStatus;
  }

  const currentRank = ORDER_STAGE_RANK[currentStage];

  if (currentRank >= ORDER_STAGE_RANK.preparing) {
    const status = norm(safe.status);
    if (status && PRE_PAYMENT_STATUS_VALUES.has(status)) {
      delete safe.status;
    }
    const ds = norm(safe.deliveryStatus);
    if (!ds || EARLY_COURIER_VALUES.has(ds)) {
      delete safe.deliveryStatus;
    }
    if (safe.driverId === null || safe.assignedDriverId === null) {
      delete safe.driverId;
      delete safe.assignedDriverId;
      delete safe.driverName;
      delete safe.driverPhone;
    }
  }

  if (currentRank >= ORDER_STAGE_RANK.driver_assigned) {
    if (safe.driverId === null || safe.assignedDriverId === null) {
      delete safe.driverId;
      delete safe.assignedDriverId;
      delete safe.driverName;
      delete safe.driverPhone;
    }
  }

  if (currentStage === 'delivered') {
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.paymentStatus;
  }

  return safe;
}

export type OrderStageInput = {
  id?: string;
  status?: unknown;
  paymentStatus?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  pickedUpAt?: unknown;
  pickedUpAtMs?: number | null;
  deliveredAt?: unknown;
  deliveredAtMs?: number | null;
  cancelledAt?: unknown;
  cancelledAtMs?: number | null;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isPaid(paymentStatus: unknown): boolean {
  return norm(paymentStatus) === 'paid';
}

function hasTimestamp(...values: unknown[]): boolean {
  for (const value of values) {
    const ms = safeToMillis(value);
    if (ms != null && ms > 0) return true;
  }
  return false;
}

function hasDriver(order: OrderStageInput): boolean {
  const id = order.driverId ?? order.assignedDriverId;
  return typeof id === 'string' && id.trim().length > 0;
}

function kitchenStatus(order: OrderStageInput): string {
  const status = norm(order.status);
  if (status === 'pending_payment') return 'awaiting_payment';
  if (status === 'confirmed') return 'payment_confirmed';
  if (status === 'completed') return 'delivered';
  return status;
}

function isRestaurantAccepted(order: OrderStageInput): boolean {
  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    status === 'accepted' ||
    status === 'restaurant_accepted' ||
    status === 'preparing' ||
    courier === 'accepted' ||
    courier === 'preparing'
  );
}

function isReadyForDriver(order: OrderStageInput): boolean {
  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    status === 'ready' ||
    status === 'ready_for_pickup' ||
    courier === 'ready_for_pickup'
  );
}

function isPickedUp(order: OrderStageInput): boolean {
  if (hasTimestamp(order.pickedUpAt, order.pickedUpAtMs)) return true;
  const status = kitchenStatus(order);
  const courierRaw = norm(order.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    status === 'picked_up' ||
    status === 'on_the_way' ||
    status === 'arrived_customer' ||
    courier === 'picked_up' ||
    courierRaw === 'on_the_way' ||
    courierRaw === 'near_customer' ||
    courierRaw === 'heading_to_customer'
  );
}

function isDelivered(order: OrderStageInput): boolean {
  if (hasTimestamp(order.deliveredAt, order.deliveredAtMs)) return true;
  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return status === 'delivered' || courier === 'delivered';
}

function isCancelled(order: OrderStageInput): boolean {
  if (hasTimestamp(order.cancelledAt, order.cancelledAtMs)) return true;
  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    status === 'cancelled' ||
    status === 'rejected' ||
    status === 'payment_failed' ||
    courier === 'cancelled'
  );
}

/**
 * Canonical order lifecycle stage for all marketplace UIs.
 */
export function deriveOrderStage(order: OrderStageInput | null | undefined): DerivedOrderStage {
  if (!order) return 'awaiting_payment';

  if (isCancelled(order)) return 'cancelled';
  if (isDelivered(order)) return 'delivered';
  if (isPickedUp(order)) return 'picked_up';

  if (hasDriver(order) && !isPickedUp(order)) {
    return 'driver_assigned';
  }

  if (isReadyForDriver(order)) {
    return 'driver_assignment';
  }

  if (isRestaurantAccepted(order)) {
    return 'preparing';
  }

  const status = kitchenStatus(order);
  const paid = isPaid(order.paymentStatus);

  if (paid) {
    if (
      status === 'pending' ||
      status === 'payment_confirmed' ||
      status === 'pending_driver' ||
      status === 'awaiting_payment'
    ) {
      return 'awaiting_restaurant';
    }
    return 'awaiting_restaurant';
  }

  if (
    status === 'awaiting_payment' ||
    status === 'payment_processing' ||
    status === 'payment_failed' ||
    status === 'pending_payment' ||
    status === 'pending' ||
    status === 'pending_driver'
  ) {
    return 'awaiting_payment';
  }

  return 'awaiting_payment';
}

export function logOrderStage(order: OrderStageInput | null | undefined): DerivedOrderStage {
  const derivedStage = deriveOrderStage(order);
  if (__DEV__) {
    console.log('[ORDER STAGE]', {
      orderId: order?.id ?? null,
      paymentStatus: order?.paymentStatus ?? null,
      status: order?.status ?? null,
      deliveryStatus: order?.deliveryStatus ?? null,
      derivedStage,
    });
  }
  return derivedStage;
}

/** Kitchen header badge — payment-aware (never "Awaiting payment" when paid). */
export function restaurantStageBadgeLabel(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): string {
  const paid = order ? isPaid(order.paymentStatus) : false;
  const status = order ? kitchenStatus(order) : '';

  if (stage === 'awaiting_restaurant' && paid) {
    if (
      status === 'awaiting_payment' ||
      status === 'payment_confirmed' ||
      status === 'pending' ||
      status === 'pending_driver'
    ) {
      return 'Awaiting Restaurant';
    }
  }

  switch (stage) {
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'awaiting_restaurant':
      return paid ? 'Awaiting Restaurant' : 'Pending';
    case 'preparing':
      return 'Preparing';
    case 'driver_assignment':
      return 'Ready for pickup';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'picked_up':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Order';
  }
}

export function restaurantKitchenBadgeTone(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): { bg: string; fg: string } {
  const paid = order ? isPaid(order.paymentStatus) : false;
  if (stage === 'awaiting_restaurant' && paid) {
    return { bg: '#DCFCE7', fg: '#166534' };
  }
  if (stage === 'preparing' || stage === 'driver_assigned') {
    return { bg: '#DBEAFE', fg: '#1D4ED8' };
  }
  if (stage === 'awaiting_payment' || (stage === 'awaiting_restaurant' && !paid)) {
    return { bg: '#FEF3C7', fg: '#92400E' };
  }
  if (stage === 'driver_assignment') {
    return { bg: '#DCFCE7', fg: '#166534' };
  }
  if (stage === 'picked_up') {
    return { bg: '#E0E7FF', fg: '#3730A3' };
  }
  if (stage === 'delivered') {
    return { bg: '#E5E7EB', fg: '#374151' };
  }
  if (stage === 'cancelled') {
    return { bg: '#FEE2E2', fg: '#991B1B' };
  }
  return { bg: '#F1F5F9', fg: '#475569' };
}

export function restaurantCourierBadgeLabel(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): string {
  const paid = order ? isPaid(order.paymentStatus) : false;
  if (stage === 'awaiting_restaurant' && paid) {
    return 'Payment confirmed';
  }

  switch (stage) {
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'awaiting_restaurant':
      return 'Awaiting restaurant';
    case 'preparing':
      return 'Preparing';
    case 'driver_assignment':
      return 'Awaiting driver';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'picked_up':
      return 'Picked up';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Order';
  }
}

export function customerStageTitle(stage: DerivedOrderStage): string {
  switch (stage) {
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'awaiting_restaurant':
      return 'Restaurant reviewing your order';
    case 'preparing':
      return 'Restaurant is preparing your food';
    case 'driver_assignment':
      return 'Finding a driver';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'picked_up':
      return 'Driver is on the way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Order cancelled';
    default:
      return 'Order update';
  }
}

export function customerStageSubtitle(stage: DerivedOrderStage): string {
  switch (stage) {
    case 'awaiting_payment':
      return 'Complete checkout to place your order.';
    case 'awaiting_restaurant':
      return 'The restaurant will confirm your order shortly.';
    case 'preparing':
      return 'Your food is being prepared.';
    case 'driver_assignment':
      return 'Matching you with the best available courier.';
    case 'driver_assigned':
      return 'Your courier is heading to the restaurant.';
    case 'picked_up':
      return 'Your order is on the way to you.';
    case 'delivered':
      return 'Enjoy your meal.';
    case 'cancelled':
      return 'This delivery is no longer active.';
    default:
      return '';
  }
}

export function driverMarketplaceStageLabel(stage: DerivedOrderStage): string {
  switch (stage) {
    case 'preparing':
      return 'Restaurant preparing';
    case 'driver_assignment':
      return 'Ready for pickup';
    case 'driver_assigned':
      return 'Assigned to you';
    case 'picked_up':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    default:
      return restaurantCourierBadgeLabel(stage);
  }
}
