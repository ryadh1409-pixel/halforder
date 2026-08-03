import {
  CUSTOMER_DELIVERY_STAGE,
  logCustomerStatusResolve,
  resolveCustomerDeliveryStage,
} from '@/lib/customerDeliveryStatus';
import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { isOrderCompleted } from '@/lib/orderCompletion';
import type { OrderStageInput } from '@/services/orderStage';
import { safeToMillis } from '@/utils/safeToMillis';

/**
 * Canonical ordered delivery timeline — one entry per logical stage id.
 *
 * Semantic merge: kitchen/courier "ready / waiting / arrived at restaurant"
 * aliases resolve to a single `waiting_at_restaurant` stage (after driver_assigned).
 * Never emit both `ready_for_pickup` and `driver_at_restaurant` as timeline rows.
 */
export const DELIVERY_STAGES = [
  {
    key: 'order_placed',
    label: 'Order placed',
    statuses: ['awaiting_payment', 'payment_confirmed', 'pending', 'pending_driver'],
  },
  {
    key: 'restaurant_accepted',
    label: 'Restaurant accepted',
    statuses: ['accepted', 'awaiting_restaurant', 'restaurant_accepted'],
  },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'] },
  {
    key: 'driver_assigned',
    label: 'Driver assigned',
    statuses: [
      'driver_assigned',
      'driver_on_way',
      'driver_accepted',
      'heading_to_restaurant',
    ],
  },
  {
    key: 'waiting_at_restaurant',
    label: 'Waiting at restaurant',
    statuses: [
      // Kitchen ready / pool waiting (clamped to preparing until a driver exists)
      'ready_for_pickup',
      'waiting_driver',
      'awaiting_driver',
      'ready',
      // Driver arrived / waiting at restaurant
      'driver_at_restaurant',
      'arrived_restaurant',
      'arriving_restaurant',
      'driver_waiting',
      'waiting_at_restaurant',
      'arrived',
    ],
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    statuses: ['picked_up'],
  },
  {
    key: 'on_the_way',
    label: 'Heading your way',
    statuses: ['on_the_way', 'heading_to_customer', 'en_route_to_customer'],
  },
  {
    key: 'driver_nearby',
    label: 'Driver is nearby',
    statuses: ['near_customer', 'arrived_customer', 'arrived_nearby'],
  },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'completed'] },
] as const;

export type CustomerTrackStep = (typeof DELIVERY_STAGES)[number]['key'];

/** Legacy timeline ids — map to `waiting_at_restaurant` (never render as separate rows). */
export type LegacyCustomerTrackStep = 'ready_for_pickup' | 'driver_at_restaurant';

export type CustomerTrackPhase =
  | CustomerTrackStep
  | LegacyCustomerTrackStep
  | 'cancelled';

/** @deprecated Use DELIVERY_STAGES */
export const CUSTOMER_TRACK_STEPS = DELIVERY_STAGES.map((s) => ({
  key: s.key,
  label: s.label,
}));

const STAGE_INDEX: Record<CustomerTrackStep, number> = DELIVERY_STAGES.reduce(
  (acc, stage, idx) => {
    acc[stage.key] = idx;
    return acc;
  },
  {} as Record<CustomerTrackStep, number>,
);

const STATUS_TO_STAGE_INDEX = new Map<string, number>();
for (let i = 0; i < DELIVERY_STAGES.length; i += 1) {
  for (const status of DELIVERY_STAGES[i].statuses) {
    STATUS_TO_STAGE_INDEX.set(status, i);
  }
}

/** Collapse legacy / alias stage ids onto the canonical timeline id. */
export function canonicalizeCustomerTrackStep(
  step: CustomerTrackPhase,
): CustomerTrackPhase {
  if (step === 'ready_for_pickup' || step === 'driver_at_restaurant') {
    return 'waiting_at_restaurant';
  }
  return step;
}

function hasAssignedDriver(order: OrderStageInput): boolean {
  const id = order.driverId ?? order.assignedDriverId;
  return typeof id === 'string' && id.trim().length > 0;
}

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasTimestamp(...values: unknown[]): boolean {
  for (const value of values) {
    const ms = safeToMillis(value);
    if (ms != null && ms > 0) return true;
  }
  return false;
}

/** Kitchen `status` aliases — mirrors orderStage kitchenStatus for lifecycle fields. */
function lifecycleStatusValue(value: unknown): string {
  const s = norm(value);
  if (s === 'completed') return 'delivered';
  return s;
}

function stageIndexFromField(value: unknown): number {
  const raw = lifecycleStatusValue(value);
  if (!raw) return -1;
  const direct = STATUS_TO_STAGE_INDEX.get(raw);
  if (direct != null) return direct;
  const normalized = normalizeMarketplaceDeliveryStatus(raw);
  return STATUS_TO_STAGE_INDEX.get(normalized) ?? -1;
}

/**
 * Post-pickup courier finesse — reads raw Firestore values before marketplace
 * normalize collapses `on_the_way` / `near_customer` into `picked_up`.
 */
function postPickupTrackStep(order: OrderStageInput): CustomerTrackStep | null {
  const rawCourier = norm(order.deliveryStatus);
  const rawStatus = norm(order.status);
  const nearby = new Set([
    'near_customer',
    'arrived_customer',
    'arrived_nearby',
  ]);
  const onWay = new Set([
    'on_the_way',
    'heading_to_customer',
    'en_route_to_customer',
  ]);
  if (nearby.has(rawCourier) || nearby.has(rawStatus)) return 'driver_nearby';
  if (onWay.has(rawCourier) || onWay.has(rawStatus)) return 'on_the_way';
  return null;
}

function courierStageFromOrder(order: OrderStageInput): CustomerTrackStep | null {
  const fine = postPickupTrackStep(order);
  if (fine) return fine;
  const deliveryStage = resolveCustomerDeliveryStage(order);
  if (deliveryStage === CUSTOMER_DELIVERY_STAGE.DELIVERED) return 'delivered';
  if (deliveryStage === CUSTOMER_DELIVERY_STAGE.PICKED_UP) return 'picked_up';
  if (deliveryStage === CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT) {
    return 'waiting_at_restaurant';
  }
  if (deliveryStage === CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED) return 'driver_assigned';
  return null;
}

function indexToStep(index: number): CustomerTrackStep {
  if (index < 0) return 'order_placed';
  return DELIVERY_STAGES[Math.min(index, DELIVERY_STAGES.length - 1)].key;
}

function isCancelled(order: OrderStageInput): boolean {
  if (hasTimestamp(order.cancelledAt, order.cancelledAtMs)) return true;
  const status = norm(order.status);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  return status === 'cancelled' || status === 'rejected' || courier === 'cancelled';
}

function isPickedUp(order: OrderStageInput): boolean {
  if (hasTimestamp(order.pickedUpAt, order.pickedUpAtMs)) return true;
  return (
    stageIndexFromField(order.status) >= STAGE_INDEX.picked_up ||
    stageIndexFromField(order.deliveryStatus) >= STAGE_INDEX.picked_up
  );
}

/**
 * Resolves the active customer timeline step from persisted Firestore fields only.
 * Never invents restaurant/driver stages from driverId presence or other secondary signals.
 */
export function resolveCustomerTrackStep(
  order: OrderStageInput | null | undefined,
): CustomerTrackPhase {
  if (!order) return 'order_placed';
  if (isCancelled(order)) return 'cancelled';
  if (isOrderCompleted(order)) return 'delivered';

  const statusNorm = norm(order.status);
  const courierNorm = norm(order.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (
    courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED ||
    courierNorm === 'completed' ||
    statusNorm === 'completed'
  ) {
    return 'delivered';
  }

  const courierStep = courierStageFromOrder(order);
  if (courierStep === 'driver_nearby' || courierStep === 'on_the_way') {
    logResolvedCustomerTrackStep(order, courierStep);
    return courierStep;
  }
  if (courierStep === 'picked_up' || isPickedUp(order)) {
    const fine = postPickupTrackStep(order);
    const step = fine ?? 'picked_up';
    logResolvedCustomerTrackStep(order, step);
    return step;
  }
  if (courierStep === 'waiting_at_restaurant') {
    logResolvedCustomerTrackStep(order, 'waiting_at_restaurant');
    return 'waiting_at_restaurant';
  }
  if (courierStep === 'driver_assigned') {
    logResolvedCustomerTrackStep(order, 'driver_assigned');
    return 'driver_assigned';
  }

  // Furthest persisted kitchen OR courier field — no driverId promotion / no skipping.
  const kitchenIndex = stageIndexFromField(order.status);
  const courierIndex = stageIndexFromField(order.deliveryStatus);
  let index = Math.max(kitchenIndex, courierIndex);
  if (index < 0) index = STAGE_INDEX.order_placed;

  // Kitchen/pool "ready / waiting_driver" maps onto waiting_at_restaurant in the
  // status table, but that stage must not appear before driver_assigned.
  if (
    index === STAGE_INDEX.waiting_at_restaurant &&
    !hasAssignedDriver(order)
  ) {
    index = STAGE_INDEX.preparing;
  }

  const step = indexToStep(index);
  logResolvedCustomerTrackStep(order, step);
  return step;
}

function logResolvedCustomerTrackStep(
  order: OrderStageInput,
  trackStep: CustomerTrackPhase,
): void {
  const orderId = typeof order.id === 'string' ? order.id.trim() : '';
  if (!orderId) return;
  logCustomerStatusResolve(
    orderId,
    order.deliveryStatus ?? null,
    resolveCustomerDeliveryStage(order),
    { trackStep },
  );
}

export function customerTrackStepIndex(step: CustomerTrackPhase): number {
  const canonical = canonicalizeCustomerTrackStep(step);
  if (canonical === 'cancelled') return -1;
  return STAGE_INDEX[canonical as CustomerTrackStep] ?? 0;
}

export function customerTrackStepLabel(step: CustomerTrackPhase): string {
  const canonical = canonicalizeCustomerTrackStep(step);
  if (canonical === 'cancelled') return 'Order cancelled';
  const match = DELIVERY_STAGES.find((s) => s.key === canonical);
  return match?.label ?? 'Order update';
}

/** Track-order header title — maps current Firestore lifecycle to customer-facing copy. */
export function customerTrackHeaderTitle(step: CustomerTrackPhase): string {
  switch (canonicalizeCustomerTrackStep(step)) {
    case 'order_placed':
      return 'Restaurant reviewing your order';
    case 'restaurant_accepted':
    case 'preparing':
      return 'Restaurant is preparing your order';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'waiting_at_restaurant':
      return 'Waiting at restaurant';
    case 'picked_up':
      return 'Picked up';
    case 'on_the_way':
      return 'Heading your way';
    case 'driver_nearby':
      return 'Arriving soon';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Order cancelled';
    default:
      return 'Order update';
  }
}

/** @deprecated Use customerTrackHeaderTitle */
export function customerTrackStepTitle(step: CustomerTrackPhase): string {
  return customerTrackHeaderTitle(step);
}

export function customerTrackStepSubtitle(step: CustomerTrackPhase): string {
  switch (canonicalizeCustomerTrackStep(step)) {
    case 'order_placed':
      return 'The restaurant will confirm your order shortly.';
    case 'restaurant_accepted':
      return 'Your order has been accepted.';
    case 'preparing':
      return 'Your food is being prepared.';
    case 'driver_assigned':
      return 'Driver assigned — heading to the restaurant.';
    case 'waiting_at_restaurant':
      return 'Driver waiting at the restaurant for your order.';
    case 'picked_up':
      return 'Your order was picked up.';
    case 'on_the_way':
      return 'Your driver is heading to you.';
    case 'driver_nearby':
      return 'Driver is nearby — almost there.';
    case 'delivered':
      return 'Your order has been delivered.';
    case 'cancelled':
      return 'This delivery is no longer active.';
    default:
      return 'We’ll keep this page updated in real time.';
  }
}

export function customerTrackProgress(step: CustomerTrackPhase): number {
  const canonical = canonicalizeCustomerTrackStep(step);
  if (canonical === 'cancelled') return 0;
  const idx = customerTrackStepIndex(canonical);
  if (idx < 0) return 0.08;
  if (canonical === 'delivered') return 1;
  return Math.min(1, (idx + 1) / DELIVERY_STAGES.length);
}

/** True when the customer should see the delivered completion state. */
export function isCustomerOrderDelivered(order: OrderStageInput | null | undefined): boolean {
  return isOrderCompleted(order);
}
