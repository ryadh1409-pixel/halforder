/**
 * Canonical marketplace lifecycle milestones for observability.
 * Logs on every Firestore status/deliveryStatus write.
 */

export type OrderLifecycleMilestone =
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'driver_assigned'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'unknown';

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Map raw kitchen + courier fields to a single lifecycle milestone. */
export function resolveOrderLifecycleMilestone(
  status: unknown,
  deliveryStatus: unknown,
): OrderLifecycleMilestone {
  const kitchen = norm(status);
  const courier = norm(deliveryStatus);

  if (kitchen === 'cancelled' || courier === 'cancelled') return 'cancelled';
  if (kitchen === 'completed' || courier === 'delivered') return 'completed';
  if (courier === 'delivered') return 'delivered';
  if (
    courier === 'on_the_way' ||
    courier === 'near_customer' ||
    kitchen === 'on_the_way' ||
    kitchen === 'arrived_customer'
  ) {
    return 'out_for_delivery';
  }
  if (courier === 'picked_up' || kitchen === 'picked_up') return 'picked_up';
  if (
    courier === 'ready_for_pickup' ||
    courier === 'ready' ||
    courier === 'waiting_driver' ||
    kitchen === 'ready_for_pickup'
  ) {
    return 'ready_for_pickup';
  }
  if (courier === 'driver_assigned' || kitchen === 'driver_assigned') return 'driver_assigned';
  if (
    kitchen === 'payment_confirmed' ||
    kitchen === 'pending_driver' ||
    (kitchen === 'pending' && courier === 'pending')
  ) {
    return 'payment_confirmed';
  }
  if (
    kitchen === 'awaiting_payment' ||
    kitchen === 'pending_payment' ||
    kitchen === 'payment_processing'
  ) {
    return 'awaiting_payment';
  }
  return 'unknown';
}

export type OrderLifecycleTransitionMeta = {
  source?: string | null;
  firestorePath?: string;
  previousDeliveryStatus?: unknown;
  newDeliveryStatus?: unknown;
  /** When a write was blocked or skipped. */
  blocked?: boolean;
  reason?: string | null;
};

/**
 * Log whenever an order crosses a lifecycle milestone (kitchen or courier change).
 */
export function logOrderLifecycleTransition(
  orderId: string,
  previousStatus: unknown,
  newStatus: unknown,
  meta?: OrderLifecycleTransitionMeta,
): void {
  const prevCourier = meta?.previousDeliveryStatus ?? null;
  const nextCourier = meta?.newDeliveryStatus ?? null;
  const prevKitchen = previousStatus ?? null;
  const nextKitchen = newStatus ?? null;

  const from = resolveOrderLifecycleMilestone(prevKitchen, prevCourier);
  const to = resolveOrderLifecycleMilestone(nextKitchen, nextCourier);

  const kitchenChanged = norm(prevKitchen) !== norm(nextKitchen);
  const courierChanged = norm(prevCourier) !== norm(nextCourier);
  if (!kitchenChanged && !courierChanged && !meta?.blocked) return;

  console.log('[ORDER LIFECYCLE TRANSITION]', {
    orderId,
    fromMilestone: from,
    toMilestone: to,
    previousStatus: prevKitchen,
    newStatus: nextKitchen,
    previousDeliveryStatus: prevCourier,
    newDeliveryStatus: nextCourier,
    source: meta?.source ?? null,
    firestorePath: meta?.firestorePath ?? `orders/${orderId}`,
    blocked: meta?.blocked ?? false,
    reason: meta?.reason ?? null,
    timestamp: Date.now(),
  });
}
