import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
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
      'arriving_restaurant',
      'heading_to_restaurant',
    ],
  },
  {
    key: 'at_restaurant',
    label: 'Driver at restaurant',
    statuses: ['arrived_restaurant', 'heading_to_restaurant'],
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    statuses: [
      'picked_up',
      'on_the_way',
      'near_customer',
      'heading_to_customer',
      'arrived_customer',
    ],
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

function hasDriver(order: OrderStageInput): boolean {
  const id = order.driverId ?? order.assignedDriverId;
  return typeof id === 'string' && id.trim().length > 0;
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

function courierStageFromOrder(order: OrderStageInput): CustomerTrackStep | null {
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  if (courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED) return 'delivered';
  if (courier === MARKETPLACE_DELIVERY_STATUS.PICKED_UP) return 'picked_up';
  if (courier === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP && hasDriver(order)) {
    return 'at_restaurant';
  }
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

function isDelivered(order: OrderStageInput): boolean {
  if (hasTimestamp(order.deliveredAt, order.deliveredAtMs, order.completedAt, order.completedAtMs)) {
    return true;
  }
  const status = norm(order.status);
  if (status === 'completed') return true;
  return (
    stageIndexFromField(order.status) >= STAGE_INDEX.delivered ||
    stageIndexFromField(order.deliveryStatus) >= STAGE_INDEX.delivered
  );
}

function isPickedUp(order: OrderStageInput): boolean {
  if (hasTimestamp(order.pickedUpAt, order.pickedUpAtMs)) return true;
  return (
    stageIndexFromField(order.status) >= STAGE_INDEX.picked_up ||
    stageIndexFromField(order.deliveryStatus) >= STAGE_INDEX.picked_up
  );
}

/**
 * Resolves the active customer timeline step — courier `deliveryStatus` is authoritative.
 * Kitchen `status` (e.g. payment_confirmed) must never cap delivery progress.
 */
export function resolveCustomerTrackStep(
  order: OrderStageInput | null | undefined,
): CustomerTrackPhase {
  if (!order) return 'order_placed';
  if (isCancelled(order)) return 'cancelled';

  const statusNorm = norm(order.status);
  const courierNorm = norm(order.deliveryStatus);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (
    courier === MARKETPLACE_DELIVERY_STATUS.DELIVERED ||
    courierNorm === 'completed' ||
    statusNorm === 'completed' ||
    isDelivered(order)
  ) {
    return 'delivered';
  }

  const courierStep = courierStageFromOrder(order);
  if (courierStep === 'picked_up' || isPickedUp(order)) return 'picked_up';
  if (courierStep === 'at_restaurant') return 'at_restaurant';

  let index = stageIndexFromField(order.deliveryStatus);
  if (index < 0) index = STAGE_INDEX.order_placed;

  if (hasDriver(order) && index < STAGE_INDEX.driver_assigned) {
    index = STAGE_INDEX.driver_assigned;
  }

  return indexToStep(index);
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
    case 'at_restaurant':
      return 'Driver at restaurant';
    case 'picked_up':
      return 'Driver heading to you';
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
    case 'at_restaurant':
      return 'Your courier has arrived at the restaurant.';
    case 'picked_up':
      return 'Your order is on the way to you.';
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
  if (!order) return false;
  const statusNorm = norm(order.status);
  const courierNorm = norm(order.deliveryStatus);
  if (
    courierNorm === 'delivered' ||
    courierNorm === 'completed' ||
    statusNorm === 'completed'
  ) {
    return true;
  }
  return resolveCustomerTrackStep(order) === 'delivered';
}
