import {normalizeMarketplaceDeliveryStatus} from "./marketplaceDeliveryStatus.js";

/** Courier stages the driver has already advanced — backend must not regress these. */
export const DRIVER_FULFILLED_STATUSES = [
  "ready_for_pickup",
  "picked_up",
  "delivered",
  "completed",
] as const;

const DRIVER_FULFILLED_SET = new Set<string>(DRIVER_FULFILLED_STATUSES);

const REGRESSIVE_COURIER_VALUES = new Set([
  "pending",
  "driver_assigned",
  "accepted",
  "preparing",
  "waiting_driver",
  "",
]);

export function courierStatusRaw(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when driver (or system) has moved the order to pickup-ready or beyond. */
export function isDriverFulfillmentAdvanced(deliveryStatus: unknown): boolean {
  const raw = courierStatusRaw(deliveryStatus);
  if (DRIVER_FULFILLED_SET.has(raw)) return true;
  const normalized = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  return (
    normalized === "ready_for_pickup" ||
    normalized === "picked_up" ||
    normalized === "delivered"
  );
}

/** Block lifecycle patches that would reset courier after driver fulfillment advanced. */
export function guardPatchForDriverFulfillment(
  current: {deliveryStatus?: unknown},
  patch: Record<string, unknown>,
  logSource: string,
): Record<string, unknown> {
  if (!isDriverFulfillmentAdvanced(current.deliveryStatus)) {
    return patch;
  }

  const safe: Record<string, unknown> = {...patch};

  if (safe.deliveryStatus !== undefined) {
    const nextRaw = courierStatusRaw(safe.deliveryStatus);
    const nextAdvanced = isDriverFulfillmentAdvanced(safe.deliveryStatus);
    if (!nextAdvanced && (REGRESSIVE_COURIER_VALUES.has(nextRaw) || nextRaw === "driver_assigned")) {
      console.log(
        "[FUNCTION] skipping — driver already advanced:",
        courierStatusRaw(current.deliveryStatus),
        {logSource, rejectedDeliveryStatus: safe.deliveryStatus},
      );
      delete safe.deliveryStatus;
    }
  }

  if (safe.driverId === null || safe.assignedDriverId === null) {
    delete safe.driverId;
    delete safe.assignedDriverId;
    delete safe.driverName;
    delete safe.driverPhone;
  }

  return safe;
}
