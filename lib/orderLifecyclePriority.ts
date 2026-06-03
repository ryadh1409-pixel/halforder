import {
  ORDER_STAGE_PRIORITY,
  type OrderStageInput,
} from '@/lib/orderSharedTypes';

export { ORDER_STAGE_PRIORITY } from '@/lib/orderSharedTypes';

const COURIER_PRIORITY: Record<string, number> = {
  pending: 0,
  '': 0,
  accepted: 2,
  preparing: 3,
  ready_for_pickup: 4,
  ready: 4,
  waiting_driver: 4,
  driver_assigned: 4,
  picked_up: 5,
  on_the_way: 5,
  near_customer: 5,
  delivered: 6,
  cancelled: 100,
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function lifecyclePriorityFromStatus(status: unknown): number {
  const s = norm(status);
  if (!s) return 0;
  return ORDER_STAGE_PRIORITY[s] ?? 1;
}

export function lifecyclePriorityFromCourier(deliveryStatus: unknown): number {
  const ds = norm(deliveryStatus);
  if (!ds) return 0;
  return COURIER_PRIORITY[ds] ?? 1;
}

/** Best-effort rank from raw Firestore fields (status + courier) — no deriveOrderStage import. */
export function lifecyclePriorityFromOrder(order: OrderStageInput | null | undefined): number {
  if (!order) return 0;
  return Math.max(
    lifecyclePriorityFromStatus(order.status),
    lifecyclePriorityFromCourier(order.deliveryStatus),
  );
}

export function wouldDowngradeLifecycle(
  current: OrderStageInput,
  patch: Record<string, unknown>,
): boolean {
  const currentPriority = lifecyclePriorityFromOrder(current);
  const merged: OrderStageInput = {
    ...current,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.deliveryStatus !== undefined ? { deliveryStatus: patch.deliveryStatus } : {}),
    ...(patch.paymentStatus !== undefined ? { paymentStatus: patch.paymentStatus } : {}),
  };
  const incomingPriority = lifecyclePriorityFromOrder(merged);
  if (patch.status !== undefined) {
    const statusOnlyIncoming = lifecyclePriorityFromStatus(patch.status);
    if (statusOnlyIncoming < currentPriority) return true;
  }
  if (patch.deliveryStatus !== undefined) {
    const courierOnlyIncoming = lifecyclePriorityFromCourier(patch.deliveryStatus);
    if (courierOnlyIncoming < lifecyclePriorityFromCourier(current.deliveryStatus)) {
      return true;
    }
  }
  return incomingPriority < currentPriority;
}
