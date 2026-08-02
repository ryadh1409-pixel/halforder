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

/** Delivery progress steps — matched against live `status` and `deliveryStatus`. */
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
    key: 'ready_for_pickup',
    label: 'Ready for pickup',
    statuses: ['ready_for_pickup', 'waiting_driver', 'awaiting_driver', 'ready'],
  },
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
    key: 'driver_at_restaurant',
    label: 'Driver arrived at restaurant',
    statuses: [
      'driver_at_restaurant',
      'arrived_restaurant',
      'arriving_restaurant',
    ],
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    statuses: ['picked_up'],
  },
  {
    key: 'on_the_way',
    label: 'Driver on the way',
    statuses: ['on_the_way', 'heading_to_customer', 'en_route_to_customer'],
  },
  {
    key: 'driver_nearby',
    label: 'Driver nearby',
    statuses: ['near_customer', 'arrived_customer', 'arrived_nearby'],
  },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'completed'] },
] as const;

export type CustomerTrackStep = (typeof DELIVERY_STAGES)[number]['key'];
export type CustomerTrackPhase = CustomerTrackStep | 'cancelled';

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
    return 'driver_at_restaurant';
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
  if (courierStep === 'driver_at_restaurant') {
    logResolvedCustomerTrackStep(order, 'driver_at_restaurant');
    return 'driver_at_restaurant';
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
  if (step === 'cancelled') return -1;
  return STAGE_INDEX[step] ?? 0;
}

export function customerTrackStepLabel(step: CustomerTrackPhase): string {
  if (step === 'cancelled') return 'Order cancelled';
  const match = DELIVERY_STAGES.find((s) => s.key === step);
  return match?.label ?? 'Order update';
}

/** Track-order header title — maps current Firestore lifecycle to customer-facing copy. */
export function customerTrackHeaderTitle(step: CustomerTrackPhase): string {
  switch (step) {
    case 'order_placed':
      return 'Restaurant reviewing your order';
    case 'restaurant_accepted':
    case 'preparing':
      return 'Restaurant is preparing your order';
    case 'ready_for_pickup':
      return 'Ready for pickup - Driver on the way';
    case 'driver_assigned':
      return 'Driver heading to restaurant';
    case 'driver_at_restaurant':
      return 'Driver arrived at restaurant';
    case 'picked_up':
      return 'Order picked up';
    case 'on_the_way':
      return 'Driver on the way';
    case 'driver_nearby':
      return 'Driver nearby';
    case 'delivered':
      return 'Your order has been delivered! 🎉';
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
  switch (step) {
    case 'order_placed':
      return 'The restaurant will confirm your order shortly.';
    case 'restaurant_accepted':
      return 'Your order has been accepted.';
    case 'preparing':
      return 'Your food is being prepared.';
    case 'ready_for_pickup':
      return 'Your order is ready — matching you with a courier.';
    case 'driver_assigned':
      return 'Your courier is heading to the restaurant.';
    case 'driver_at_restaurant':
      return 'Your courier has arrived at the restaurant.';
    case 'picked_up':
      return 'Your courier has your order.';
    case 'on_the_way':
      return 'Your order is on the way to you.';
    case 'driver_nearby':
      return 'Your courier is almost there.';
    case 'delivered':
      return 'Enjoy your meal.';
    case 'cancelled':
      return 'This delivery is no longer active.';
    default:
      return 'We’ll keep this page updated in real time.';
  }
}

export function customerTrackProgress(step: CustomerTrackPhase): number {
  if (step === 'cancelled') return 0;
  const idx = customerTrackStepIndex(step);
  if (idx < 0) return 0.08;
  if (step === 'delivered') return 1;
  return Math.min(1, (idx + 1) / DELIVERY_STAGES.length);
}

/** True when the customer should see the delivered completion state. */
export function isCustomerOrderDelivered(order: OrderStageInput | null | undefined): boolean {
  return isOrderCompleted(order);
}
