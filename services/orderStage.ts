import { isOrderCompleted } from '@/lib/orderCompletion';
import { lifecyclePriorityFromCourier } from '@/lib/orderLifecyclePriority';
import {
  compareOrderStage,
  ORDER_STAGE_RANK,
  type DerivedOrderStage,
  type OrderStageInput
} from '@/lib/orderSharedTypes';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import { ENABLE_ORDER_TRACE } from '@/lib/orderTraceFlags';
import { safeToMillis } from '@/utils/safeToMillis';

export {
  compareOrderStage,
  ORDER_STAGE_PRIORITY,
  ORDER_STAGE_RANK,
  type DerivedOrderStage,
  type OrderStageInput
} from '@/lib/orderSharedTypes';

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

const PRE_ASSIGNMENT_KITCHEN_STATUSES = new Set([
  'awaiting_payment',
  'pending_payment',
  'payment_processing',
  'payment_failed',
  'pending',
  'payment_confirmed',
  'pending_driver',
]);

const ASSIGNED_OR_LATER_COURIER_VALUES = new Set([
  'driver_assigned',
  'ready_for_pickup',
  'ready',
  'waiting_driver',
  'accepted_for_delivery',
  'picked_up',
  'on_the_way',
  'near_customer',
  'heading_to_restaurant',
  'arrived_restaurant',
  'delivered',
  'completed',
]);

function patchRegressesTerminalDelivery(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): boolean {
  const terminal =
    isOrderCompleted(current) ||
    (current as Record<string, unknown>).marketplaceArchived === true ||
    (current as Record<string, unknown>).earningsRecorded === true;
  if (!terminal) return false;

  const nextKitchen = norm(patch.status);
  if (
    nextKitchen &&
    nextKitchen !== 'completed' &&
    nextKitchen !== 'delivered' &&
    nextKitchen !== 'cancelled'
  ) {
    return true;
  }
  const nextCourier = norm(patch.deliveryStatus);
  if (
    nextCourier &&
    nextCourier !== 'delivered' &&
    nextCourier !== 'completed' &&
    nextCourier !== 'cancelled'
  ) {
    return true;
  }
  return false;
}

function patchRegressesAssignedCourierKitchen(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): boolean {
  if (patch.status === undefined) return false;
  const courier = norm(current.deliveryStatus);
  if (!ASSIGNED_OR_LATER_COURIER_VALUES.has(courier)) return false;
  const nextKitchen = norm(patch.status);
  return PRE_ASSIGNMENT_KITCHEN_STATUSES.has(nextKitchen);
}

function patchAdvancesCourier(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): boolean {
  if (patch.deliveryStatus === undefined) return false;
  const currentRaw = norm(current.deliveryStatus);
  const nextRaw = norm(patch.deliveryStatus);
  if (!nextRaw || nextRaw === currentRaw) return false;

  const currentPriority = lifecyclePriorityFromCourier(current.deliveryStatus);
  const nextPriority = lifecyclePriorityFromCourier(patch.deliveryStatus);
  if (nextPriority > currentPriority) return true;

  // Driver fulfillment steps can share lifecycle rank (driver_assigned → ready_for_pickup).
  return nextPriority === currentPriority && !isOrderCompleted(current);
}

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
    const allowForwardCourierRepair =
      patchAdvancesCourier(current, safe) && !isOrderCompleted(current);
    if (!allowForwardCourierRepair) {
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

  const patchCompletesOrder =
    norm(safe.status) === 'completed' || norm(safe.deliveryStatus) === 'delivered';
  const advancesCourier = patchAdvancesCourier(current, safe);

  if (patchRegressesAssignedCourierKitchen(current, safe)) {
    delete safe.status;
  }

  if (patchRegressesTerminalDelivery(current, safe)) {
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.driverId;
    delete safe.assignedDriverId;
    if (safe.marketplaceArchived === false) delete safe.marketplaceArchived;
    if (safe.earningsRecorded === false) delete safe.earningsRecorded;
  }

  // Timestamps can advance deriveOrderStage to `delivered` while status/deliveryStatus
  // still lag (webhook retry, partial repair). Allow explicit terminal completion writes
  // and forward driver fulfillment steps on regressed field state.
  if (
    currentStage === 'delivered' &&
    !isOrderCompleted(current) &&
    (patchCompletesOrder || advancesCourier)
  ) {
    return safe;
  }
  if (currentStage === 'delivered' && !(patchCompletesOrder && !isOrderCompleted(current))) {
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.paymentStatus;
  }

  return safe;
}

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
  const courierRaw = norm(order.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return (
    status === 'ready' ||
    status === 'ready_for_pickup' ||
    courier === 'ready_for_pickup' ||
    courierRaw === 'waiting_driver' ||
    courierRaw === 'awaiting_driver'
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
  if (hasTimestamp(order.completedAt, order.completedAtMs)) return true;
  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return status === 'delivered' || status === 'completed' || courier === 'delivered';
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

/** Kitchen action rail status for OrderActions (derived from stage only). */
export type RestaurantMerchantActionStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered';

export type RestaurantOrderPresentation = {
  derivedStage: DerivedOrderStage;
  badgeText: string;
  badgeColor: { bg: string; fg: string };
  courierBadgeText: string;
  actionText: string | null;
  canAccept: boolean;
  canReject: boolean;
  canStartPreparing: boolean;
  canReady: boolean;
  canAssignDriver: boolean;
  showPaymentBadge: boolean;
  merchantActionStatus: RestaurantMerchantActionStatus;
  driverDetailText: string;
};

/** Sub-kitchen step within `preparing` — uses fulfillment timestamps only, not status fields. */
export function restaurantKitchenSubstage(
  order: OrderStageInput,
): 'accepted' | 'preparing' | null {
  if (deriveOrderStage(order) !== 'preparing') return null;
  if (hasTimestamp(order.preparedAt, order.preparedAtMs)) return 'preparing';
  if (hasTimestamp(order.acceptedAt, order.acceptedAtMs)) return 'accepted';
  return 'accepted';
}

function badgeTextForDerivedStage(
  stage: DerivedOrderStage,
  kitchenSubstage: 'accepted' | 'preparing' | null,
): string {
  switch (stage) {
    case 'awaiting_payment':
      return 'Waiting Payment';
    case 'awaiting_restaurant':
      return 'Awaiting Restaurant';
    case 'preparing':
      return kitchenSubstage === 'preparing' ? 'Preparing' : 'Accepted';
    case 'driver_assignment':
      return 'Ready For Pickup';
    case 'driver_assigned':
      return 'Driver Assigned';
    case 'picked_up':
      return 'Picked Up';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Order';
  }
}

function badgeColorForDerivedStage(stage: DerivedOrderStage): { bg: string; fg: string } {
  switch (stage) {
    case 'awaiting_payment':
    case 'awaiting_restaurant':
      return { bg: '#FEF3C7', fg: '#92400E' };
    case 'preparing':
      return { bg: '#DBEAFE', fg: '#1D4ED8' };
    case 'driver_assignment':
      return { bg: '#DCFCE7', fg: '#166534' };
    case 'driver_assigned':
      return { bg: '#DBEAFE', fg: '#1D4ED8' };
    case 'picked_up':
      return { bg: '#E0E7FF', fg: '#3730A3' };
    case 'delivered':
      return { bg: '#E5E7EB', fg: '#374151' };
    case 'cancelled':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    default:
      return { bg: '#F1F5F9', fg: '#475569' };
  }
}

function courierBadgeTextForStage(stage: DerivedOrderStage): string {
  switch (stage) {
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'awaiting_restaurant':
      return 'Payment confirmed';
    case 'preparing':
      return 'In kitchen';
    case 'driver_assignment':
      return 'Awaiting driver';
    case 'driver_assigned':
      return 'Driver en route';
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

function merchantActionStatusForPresentation(
  stage: DerivedOrderStage,
  kitchenSubstage: 'accepted' | 'preparing' | null,
): RestaurantMerchantActionStatus {
  switch (stage) {
    case 'awaiting_payment':
    case 'awaiting_restaurant':
      return 'pending';
    case 'preparing':
      return kitchenSubstage === 'preparing' ? 'preparing' : 'accepted';
    case 'driver_assignment':
    case 'driver_assigned':
      return 'ready';
    case 'picked_up':
      return 'picked_up';
    case 'delivered':
    case 'cancelled':
      return 'delivered';
    default:
      return 'pending';
  }
}

function primaryActionTextForPresentation(
  stage: DerivedOrderStage,
  kitchenSubstage: 'accepted' | 'preparing' | null,
  flags: Pick<
    RestaurantOrderPresentation,
    'canAccept' | 'canStartPreparing' | 'canReady' | 'canAssignDriver'
  >,
): string | null {
  if (flags.canAccept) return 'Accept Order';
  if (flags.canStartPreparing) return 'Start Preparing';
  if (flags.canReady) return 'Mark Ready';
  if (flags.canAssignDriver) return 'Assign Driver';
  if (stage === 'driver_assignment') return 'Waiting for Driver';
  if (stage === 'picked_up') return 'Out for Delivery';
  if (stage === 'delivered' || stage === 'cancelled') return null;
  if (stage === 'preparing' && kitchenSubstage === 'accepted') return 'Start Preparing';
  return null;
}

function driverDetailTextForOrder(order: OrderStageInput, stage: DerivedOrderStage): string {
  if (hasDriver(order)) {
    const name =
      typeof order.driverName === 'string' ? order.driverName.trim() : '';
    if (name) return `Driver: ${name}`;
    const id = order.driverId ?? order.assignedDriverId;
    return typeof id === 'string' ? `Driver: ${id.slice(0, 8)}` : 'Driver assigned';
  }
  if (stage === 'driver_assignment') return 'Awaiting driver';
  return 'No driver assigned';
}

/**
 * Single restaurant UI selector — derive labels and actions from canonical stage only.
 */
export function getRestaurantOrderPresentation(
  order: OrderStageInput | null | undefined,
): RestaurantOrderPresentation {
  const derivedStage = deriveOrderStage(order);
  const kitchenSubstage = order ? restaurantKitchenSubstage(order) : null;

  const canAccept = derivedStage === 'awaiting_restaurant';
  const canReject =
    derivedStage === 'awaiting_restaurant' ||
    (derivedStage === 'preparing' && kitchenSubstage === 'accepted');
  const canStartPreparing =
    derivedStage === 'preparing' && kitchenSubstage === 'accepted';
  const canReady = derivedStage === 'preparing' && kitchenSubstage === 'preparing';
  const canAssignDriver = derivedStage === 'driver_assignment';

  const flags = { canAccept, canStartPreparing, canReady, canAssignDriver };

  return {
    derivedStage,
    badgeText: badgeTextForDerivedStage(derivedStage, kitchenSubstage),
    badgeColor: badgeColorForDerivedStage(derivedStage),
    courierBadgeText: courierBadgeTextForStage(derivedStage),
    actionText: primaryActionTextForPresentation(derivedStage, kitchenSubstage, flags),
    canAccept,
    canReject,
    canStartPreparing,
    canReady,
    canAssignDriver,
    showPaymentBadge: derivedStage === 'awaiting_payment',
    merchantActionStatus: merchantActionStatusForPresentation(
      derivedStage,
      kitchenSubstage,
    ),
    driverDetailText: order
      ? driverDetailTextForOrder(order, derivedStage)
      : 'No driver assigned',
  };
}

export function logOrderStage(
  order: OrderStageInput | null | undefined,
  meta?: { hasPendingWrites?: boolean },
): DerivedOrderStage {
  const derivedStage = deriveOrderStage(order);
  if (ENABLE_ORDER_TRACE) {
    const row = order as Record<string, unknown> | null | undefined;
    console.log('[ORDER STAGE]', {
      orderId: order?.id ?? null,
      status: order?.status ?? null,
      deliveryStatus: order?.deliveryStatus ?? null,
      paymentStatus: order?.paymentStatus ?? null,
      updatedBy: typeof row?.updatedBy === 'string' ? row.updatedBy : null,
      hasPendingWrites: meta?.hasPendingWrites ?? false,
      derivedStage,
    });
  }
  return derivedStage;
}

/** @deprecated Use {@link getRestaurantOrderPresentation}.badgeText */
export function restaurantStageBadgeLabel(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): string {
  if (order) return getRestaurantOrderPresentation(order).badgeText;
  return badgeTextForDerivedStage(stage, null);
}

/** @deprecated Use {@link getRestaurantOrderPresentation}.badgeColor */
export function restaurantKitchenBadgeTone(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): { bg: string; fg: string } {
  if (order) return getRestaurantOrderPresentation(order).badgeColor;
  return badgeColorForDerivedStage(stage);
}

/** @deprecated Use {@link getRestaurantOrderPresentation}.courierBadgeText */
export function restaurantCourierBadgeLabel(
  stage: DerivedOrderStage,
  order?: OrderStageInput | null,
): string {
  if (order) return getRestaurantOrderPresentation(order).courierBadgeText;
  return courierBadgeTextForStage(stage);
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
