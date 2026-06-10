/**
 * Cloud Functions mirror of `services/orderStage.ts` monotonic guards.
 * Keep in sync when changing lifecycle ranks or regression rules.
 */
import {normalizeMarketplaceDeliveryStatus} from "./marketplaceDeliveryStatus.js";

export type MonotonicOrderStage =
  | "awaiting_payment"
  | "awaiting_restaurant"
  | "preparing"
  | "driver_assignment"
  | "driver_assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

export const ORDER_STAGE_RANK: Record<MonotonicOrderStage, number> = {
  awaiting_payment: 0,
  awaiting_restaurant: 1,
  preparing: 2,
  driver_assignment: 3,
  driver_assigned: 4,
  picked_up: 5,
  delivered: 6,
  cancelled: 7,
};

export type MonotonicOrderInput = {
  status?: unknown;
  paymentStatus?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  pickedUpAt?: unknown;
  deliveredAt?: unknown;
  cancelledAt?: unknown;
};

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isPaid(paymentStatus: unknown): boolean {
  return norm(paymentStatus) === "paid";
}

function hasDriver(order: MonotonicOrderInput): boolean {
  const id = order.driverId ?? order.assignedDriverId;
  return typeof id === "string" && id.trim().length > 0;
}

function kitchenStatus(order: MonotonicOrderInput): string {
  const status = norm(order.status);
  if (status === "pending_payment") return "awaiting_payment";
  if (status === "confirmed") return "payment_confirmed";
  if (status === "completed") return "delivered";
  return status;
}

export function deriveMonotonicOrderStage(
  order: MonotonicOrderInput | null | undefined,
): MonotonicOrderStage {
  if (!order) return "awaiting_payment";

  const status = kitchenStatus(order);
  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);

  if (status === "cancelled" || status === "rejected" || courier === "cancelled") {
    return "cancelled";
  }
  if (status === "delivered" || courier === "delivered") return "delivered";
  if (
    status === "picked_up" ||
    status === "on_the_way" ||
    courier === "picked_up"
  ) {
    return "picked_up";
  }
  if (hasDriver(order)) return "driver_assigned";
  if (
    status === "ready" ||
    status === "ready_for_pickup" ||
    courier === "ready_for_pickup"
  ) {
    return "driver_assignment";
  }
  if (
    status === "accepted" ||
    status === "restaurant_accepted" ||
    status === "preparing" ||
    courier === "accepted" ||
    courier === "preparing"
  ) {
    return "preparing";
  }
  if (!isPaid(order.paymentStatus)) return "awaiting_payment";
  if (
    status === "pending" ||
    status === "payment_confirmed" ||
    status === "pending_driver"
  ) {
    return "awaiting_restaurant";
  }
  return "awaiting_restaurant";
}

export function compareOrderStage(
  a: MonotonicOrderStage,
  b: MonotonicOrderStage,
): number {
  return ORDER_STAGE_RANK[a] - ORDER_STAGE_RANK[b];
}

const PRE_PAYMENT_STATUS_VALUES = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
]);

const EARLY_COURIER_VALUES = new Set(["pending", ""]);

const PRE_ASSIGNMENT_KITCHEN_STATUSES = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
  "pending",
  "payment_confirmed",
  "pending_driver",
]);

const ASSIGNED_OR_LATER_COURIER_VALUES = new Set([
  "driver_assigned",
  "ready_for_pickup",
  "ready",
  "waiting_driver",
  "accepted_for_delivery",
  "picked_up",
  "on_the_way",
  "near_customer",
  "heading_to_restaurant",
  "arrived_restaurant",
  "delivered",
  "completed",
]);

function patchRegressesAssignedCourierKitchen(
  current: MonotonicOrderInput,
  patch: Record<string, unknown>,
): boolean {
  if (patch.status === undefined) return false;
  const courier = norm(current.deliveryStatus);
  if (!ASSIGNED_OR_LATER_COURIER_VALUES.has(courier)) return false;
  const nextKitchen = norm(patch.status);
  return PRE_ASSIGNMENT_KITCHEN_STATUSES.has(nextKitchen);
}

export function sanitizeOrderPatchAgainstRegression(
  current: MonotonicOrderInput,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {...patch};
  const currentStage = deriveMonotonicOrderStage(current);
  const merged: MonotonicOrderInput = {
    ...current,
    ...(safe.status !== undefined ? {status: safe.status} : {}),
    ...(safe.paymentStatus !== undefined ? {paymentStatus: safe.paymentStatus} : {}),
    ...(safe.deliveryStatus !== undefined ? {deliveryStatus: safe.deliveryStatus} : {}),
    ...(safe.driverId !== undefined ? {driverId: safe.driverId} : {}),
    ...(safe.assignedDriverId !== undefined
      ? {assignedDriverId: safe.assignedDriverId}
      : {}),
  };
  const nextStage = deriveMonotonicOrderStage(merged);

  if (nextStage === "cancelled" && currentStage !== "delivered") {
    return safe;
  }

  if (compareOrderStage(nextStage, currentStage) < 0) {
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.paymentStatus;
  }

  const currentRank = ORDER_STAGE_RANK[currentStage];

  if (currentRank >= ORDER_STAGE_RANK.preparing) {
    const nextStatus = norm(safe.status);
    if (nextStatus && PRE_PAYMENT_STATUS_VALUES.has(nextStatus)) {
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

  if (patchRegressesAssignedCourierKitchen(current, safe)) {
    delete safe.status;
  }

  if (currentStage === "delivered") {
    delete safe.status;
    delete safe.deliveryStatus;
    delete safe.paymentStatus;
  }

  return safe;
}
