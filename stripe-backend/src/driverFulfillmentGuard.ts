/** Mirror of `main/src/driverFulfillmentGuard.ts` — keep in sync. */

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

function normMarketplaceDeliveryStatus(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "ready_for_pickup" || v === "picked_up" || v === "delivered") return v;
  if (v === "ready" || v === "waiting_driver" || v === "accepted_for_delivery") {
    return "ready_for_pickup";
  }
  if (v === "on_the_way" || v === "near_customer") return "picked_up";
  if (v === "completed") return "delivered";
  return v;
}

export function courierStatusRaw(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isDriverFulfillmentAdvanced(deliveryStatus: unknown): boolean {
  const raw = courierStatusRaw(deliveryStatus);
  if (DRIVER_FULFILLED_SET.has(raw)) return true;
  const normalized = normMarketplaceDeliveryStatus(deliveryStatus);
  return (
    normalized === "ready_for_pickup" ||
    normalized === "picked_up" ||
    normalized === "delivered"
  );
}

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
    const nextAdvanced = isDriverFulfillmentAdvanced(safe.deliveryStatus);
    const nextRaw = courierStatusRaw(safe.deliveryStatus);
    if (!nextAdvanced && REGRESSIVE_COURIER_VALUES.has(nextRaw)) {
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
