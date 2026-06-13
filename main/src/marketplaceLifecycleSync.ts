import type {MonotonicOrderInput} from "./orderStageMonotonic.js";

const COURIER_TO_KITCHEN: Record<string, string> = {
  pending: "payment_confirmed",
  waiting_driver: "payment_confirmed",
  awaiting_driver: "payment_confirmed",
  accepted: "accepted",
  preparing: "preparing",
  ready_for_pickup: "ready_for_pickup",
  ready: "ready_for_pickup",
  driver_assigned: "driver_assigned",
  accepted_for_delivery: "driver_assigned",
  picked_up: "picked_up",
  on_the_way: "picked_up",
  near_customer: "picked_up",
  delivered: "completed",
  cancelled: "cancelled",
};

const KITCHEN_TO_COURIER: Record<string, string> = {
  awaiting_payment: "pending",
  pending_payment: "pending",
  payment_processing: "pending",
  payment_failed: "pending",
  unpaid: "pending",
  pending: "pending",
  payment_confirmed: "pending",
  pending_driver: "pending",
  accepted: "accepted",
  restaurant_accepted: "accepted",
  preparing: "preparing",
  ready: "ready_for_pickup",
  ready_for_pickup: "ready_for_pickup",
  driver_assigned: "driver_assigned",
  driver_accepted: "driver_assigned",
  picked_up: "picked_up",
  on_the_way: "picked_up",
  arrived_customer: "picked_up",
  delivered: "completed",
  completed: "delivered",
  cancelled: "cancelled",
};

const PRE_PAYMENT_KITCHEN = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
  "unpaid",
  "payment_confirmed",
  "pending_driver",
  "pending",
]);

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function kitchenLagsCourier(current: MonotonicOrderInput, courier: string): boolean {
  const kitchen = norm(current.status);
  const paired = COURIER_TO_KITCHEN[courier];
  if (!paired) return false;
  if (!kitchen || PRE_PAYMENT_KITCHEN.has(kitchen)) return true;
  if (kitchen === "payment_confirmed" && courier !== "pending" && courier !== "waiting_driver") {
    return true;
  }
  return kitchen !== paired;
}

function courierLagsKitchen(current: MonotonicOrderInput, kitchen: string): boolean {
  const courier = norm(current.deliveryStatus);
  const paired = KITCHEN_TO_COURIER[kitchen];
  if (!paired) return false;
  if (!courier || courier === "pending") return true;
  return courier !== paired;
}

export function syncMarketplaceLifecyclePatch(
  patch: Record<string, unknown>,
  current?: MonotonicOrderInput | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {...patch};

  if (out.deliveryStatus !== undefined) {
    const courier = norm(out.deliveryStatus);
    const pairedKitchen = COURIER_TO_KITCHEN[courier];
    if (
      pairedKitchen &&
      (out.status === undefined ||
        (current && kitchenLagsCourier({...current, ...out}, courier)))
    ) {
      out.status = pairedKitchen;
    }
  }

  if (out.status !== undefined) {
    const kitchen = norm(out.status);
    const pairedCourier = KITCHEN_TO_COURIER[kitchen];
    if (
      pairedCourier &&
      (out.deliveryStatus === undefined ||
        (current && courierLagsKitchen({...current, ...out}, kitchen)))
    ) {
      out.deliveryStatus = pairedCourier;
    }
  }

  const assignsDriver =
    (typeof out.driverId === "string" && out.driverId.length > 0) ||
    (typeof out.assignedDriverId === "string" && out.assignedDriverId.length > 0);
  if (assignsDriver && out.deliveryStatus === undefined && out.status === undefined) {
    out.deliveryStatus = "driver_assigned";
    out.status = "driver_assigned";
  }

  return out;
}
