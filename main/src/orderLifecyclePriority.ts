import {
  compareOrderStage,
  deriveMonotonicOrderStage,
  ORDER_STAGE_RANK,
  type MonotonicOrderInput,
  type MonotonicOrderStage,
} from "./orderStageMonotonic.js";
import {normalizeMarketplaceDeliveryStatus} from "./marketplaceDeliveryStatus.js";

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
  picked_up: 5,
  on_the_way: 5,
  delivered: 6,
  completed: 6,
  cancelled: 100,
  rejected: 100,
  expired: 100,
};

const COURIER_PRIORITY: Record<string, number> = {
  pending: 0,
  "": 0,
  accepted: 2,
  preparing: 3,
  ready_for_pickup: 4,
  ready: 4,
  driver_assigned: 4,
  picked_up: 5,
  on_the_way: 5,
  delivered: 6,
  cancelled: 100,
};

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function lifecyclePriorityFromStatus(status: unknown): number {
  const s = norm(status);
  if (!s) return 0;
  return ORDER_STAGE_PRIORITY[s] ?? 1;
}

function lifecyclePriorityFromCourier(deliveryStatus: unknown): number {
  const ds = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  if (!ds) return 0;
  return COURIER_PRIORITY[ds] ?? 1;
}

function lifecyclePriorityFromOrder(order: MonotonicOrderInput): number {
  const fromStage = ORDER_STAGE_RANK[deriveMonotonicOrderStage(order)];
  const fromFields = Math.max(
    lifecyclePriorityFromStatus(order.status),
    lifecyclePriorityFromCourier(order.deliveryStatus),
  );
  return Math.max(fromStage, fromFields);
}

export function wouldDowngradeLifecycle(
  current: MonotonicOrderInput,
  patch: Record<string, unknown>,
): boolean {
  const currentPriority = lifecyclePriorityFromOrder(current);
  const merged: MonotonicOrderInput = {
    ...current,
    ...(patch.status !== undefined ? {status: patch.status} : {}),
    ...(patch.deliveryStatus !== undefined ? {deliveryStatus: patch.deliveryStatus} : {}),
    ...(patch.paymentStatus !== undefined ? {paymentStatus: patch.paymentStatus} : {}),
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
  if (incomingPriority < currentPriority) {
    const nextStage = deriveMonotonicOrderStage(merged) as MonotonicOrderStage;
    const curStage = deriveMonotonicOrderStage(current) as MonotonicOrderStage;
    return compareOrderStage(nextStage, curStage) < 0;
  }
  return false;
}
