import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
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

function stageIndexFromField(value: unknown): number {
  const raw = norm(value);
  if (!raw) return -1;
  const direct = STATUS_TO_STAGE_INDEX.get(raw);
  if (direct != null) return direct;
  const normalized = normalizeMarketplaceDeliveryStatus(raw);
  return STATUS_TO_STAGE_INDEX.get(normalized) ?? -1;
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
  if (hasTimestamp(order.deliveredAt, order.deliveredAtMs)) return true;
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
 * Resolves the active customer timeline step from live Firestore `status` + `deliveryStatus`.
 * Uses the furthest-forward signal (never regresses below Firestore).
 */
export function resolveCustomerTrackStep(
  order: OrderStageInput | null | undefined,
): CustomerTrackPhase {
  if (!order) return 'order_placed';
  if (isCancelled(order)) return 'cancelled';
  if (isDelivered(order)) return 'delivered';
  if (isPickedUp(order)) return 'picked_up';

  let index = Math.max(
    stageIndexFromField(order.status),
    stageIndexFromField(order.deliveryStatus),
    STAGE_INDEX.order_placed,
  );

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
    case 'picked_up':
      return 'Driver heading to you';
    case 'delivered':
      return 'Delivered!';
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
  return Math.min(1, (idx + 1) / DELIVERY_STAGES.length);
}
