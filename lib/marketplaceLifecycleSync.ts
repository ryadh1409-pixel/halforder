import type { OrderStageInput } from '@/lib/orderSharedTypes';

/** Canonical kitchen `status` for a marketplace courier `deliveryStatus`. */
const COURIER_TO_KITCHEN: Record<string, string> = {
  pending: 'payment_confirmed',
  waiting_driver: 'payment_confirmed',
  awaiting_driver: 'payment_confirmed',
  accepted: 'accepted',
  preparing: 'preparing',
  ready_for_pickup: 'ready_for_pickup',
  ready: 'ready_for_pickup',
  driver_assigned: 'driver_assigned',
  accepted_for_delivery: 'driver_assigned',
  picked_up: 'picked_up',
  on_the_way: 'picked_up',
  near_customer: 'picked_up',
  heading_to_restaurant: 'driver_assigned',
  arrived_restaurant: 'ready_for_pickup',
  delivered: 'completed',
  cancelled: 'cancelled',
};

/** Canonical courier `deliveryStatus` for a kitchen `status`. */
const KITCHEN_TO_COURIER: Record<string, string> = {
  awaiting_payment: 'pending',
  pending_payment: 'pending',
  payment_processing: 'pending',
  payment_failed: 'pending',
  unpaid: 'pending',
  pending: 'pending',
  payment_confirmed: 'pending',
  pending_driver: 'pending',
  accepted: 'accepted',
  restaurant_accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready_for_pickup',
  ready_for_pickup: 'ready_for_pickup',
  driver_assigned: 'driver_assigned',
  driver_accepted: 'driver_assigned',
  picked_up: 'picked_up',
  on_the_way: 'picked_up',
  arrived_customer: 'picked_up',
  delivered: 'completed',
  completed: 'delivered',
  cancelled: 'cancelled',
};

const PRE_PAYMENT_KITCHEN = new Set([
  'awaiting_payment',
  'pending_payment',
  'payment_processing',
  'payment_failed',
  'unpaid',
  'payment_confirmed',
  'pending_driver',
  'pending',
]);

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function pairedKitchenForCourier(courier: string): string | null {
  return COURIER_TO_KITCHEN[courier] ?? null;
}

function pairedCourierForKitchen(kitchen: string): string | null {
  return KITCHEN_TO_COURIER[kitchen] ?? null;
}

function kitchenLagsCourier(current: OrderStageInput, courier: string): boolean {
  const kitchen = norm(current.status);
  const paired = pairedKitchenForCourier(courier);
  if (!paired) return false;
  if (!kitchen || PRE_PAYMENT_KITCHEN.has(kitchen)) return true;
  if (kitchen === 'payment_confirmed' && courier !== 'pending' && courier !== 'waiting_driver') {
    return true;
  }
  return kitchen !== paired;
}

function courierLagsKitchen(current: OrderStageInput, kitchen: string): boolean {
  const courier = norm(current.deliveryStatus);
  const paired = pairedCourierForKitchen(kitchen);
  if (!paired) return false;
  if (!courier || courier === 'pending') return true;
  if (kitchen === 'payment_confirmed' && paired === 'pending') return false;
  return courier !== paired;
}

/**
 * Keep `status` and `deliveryStatus` aligned whenever either field is patched.
 * Prevents split state like payment_confirmed + ready_for_pickup.
 */
export function syncMarketplaceLifecyclePatch(
  patch: Record<string, unknown>,
  current?: OrderStageInput | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };

  if (out.deliveryStatus !== undefined) {
    const courier = norm(out.deliveryStatus);
    const pairedKitchen = pairedKitchenForCourier(courier);
    if (
      pairedKitchen &&
      (out.status === undefined ||
        (current && kitchenLagsCourier({ ...current, ...out }, courier)))
    ) {
      out.status = pairedKitchen;
    }
  }

  if (out.status !== undefined) {
    const kitchen = norm(out.status);
    const pairedCourier = pairedCourierForKitchen(kitchen);
    if (
      pairedCourier &&
      (out.deliveryStatus === undefined ||
        (current && courierLagsKitchen({ ...current, ...out }, kitchen)))
    ) {
      out.deliveryStatus = pairedCourier;
    }
  }

  return out;
}

/** Repair patch for inconsistent production docs (read-only derive, no Firestore). */
export function buildLifecycleConsistencyRepairPatch(
  current: OrderStageInput,
): Record<string, unknown> | null {
  const kitchen = norm(current.status);
  const courier = norm(current.deliveryStatus);
  if (!kitchen && !courier) return null;

  const patch: Record<string, unknown> = {};
  const hasDriver =
    (typeof current.driverId === 'string' && current.driverId.length > 0) ||
    (typeof current.assignedDriverId === 'string' && current.assignedDriverId.length > 0);

  const pin =
    typeof (current as Record<string, unknown>).deliveryPin === 'string'
      ? String((current as Record<string, unknown>).deliveryPin).trim()
      : '';
  const claimedCourier =
    courier === 'driver_assigned' ||
    courier === 'picked_up' ||
    courier === 'delivered' ||
    courier === 'heading_to_restaurant' ||
    courier === 'arrived_restaurant' ||
    /^\d{4}$/.test(pin);

  // Premature driver ids on kitchen-ready orders: clear them (do not invent driver_assigned).
  if (hasDriver && !claimedCourier && !['picked_up', 'completed', 'delivered', 'cancelled'].includes(kitchen)) {
    patch.driverId = null;
    patch.assignedDriverId = null;
    if (courier === 'ready_for_pickup' || kitchen === 'ready_for_pickup') {
      patch.status = 'ready_for_pickup';
      patch.deliveryStatus = 'ready_for_pickup';
    }
  } else if (courier && kitchenLagsCourier(current, courier)) {
    const paired = pairedKitchenForCourier(courier);
    if (paired) patch.status = paired;
  } else if (kitchen && courierLagsKitchen(current, kitchen)) {
    const paired = pairedCourierForKitchen(kitchen);
    if (paired) patch.deliveryStatus = paired;
  }

  if (Object.keys(patch).length === 0) return null;
  return syncMarketplaceLifecyclePatch(patch, current);
}
