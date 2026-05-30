/**
 * Mirror of `lib/orderStatus.ts` for Cloud Functions.
 */
export const MARKETPLACE_DELIVERY_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY_FOR_PICKUP: "ready_for_pickup",
  DRIVER_ASSIGNED: "driver_assigned",
  PICKED_UP: "picked_up",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export type MarketplaceDeliveryStatus =
  (typeof MARKETPLACE_DELIVERY_STATUS)[keyof typeof MARKETPLACE_DELIVERY_STATUS];

/** Courier statuses that may appear in driver_marketplace_pool when paid + unassigned. */
export const DRIVER_POOL_PUBLISH_COURIER_STATUSES = new Set([
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "waiting_driver",
  "ready",
  "accepted_for_delivery",
  "pending_driver",
]);

const REMOVED = new Set<string>([
  MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  MARKETPLACE_DELIVERY_STATUS.DELIVERED,
  MARKETPLACE_DELIVERY_STATUS.CANCELLED,
]);

const LEGACY: Record<string, MarketplaceDeliveryStatus> = {
  waiting_driver: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  pending_driver: MARKETPLACE_DELIVERY_STATUS.ACCEPTED,
  ready: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  accepted_for_delivery: MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP,
  driver: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  driver_accepted: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  heading_to_restaurant: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  arrived_restaurant: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
  on_the_way: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  near_customer: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
  rejected: MARKETPLACE_DELIVERY_STATUS.CANCELLED,
  completed: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
};

export function normalizeMarketplaceDeliveryStatus(
  raw: unknown,
): MarketplaceDeliveryStatus {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return MARKETPLACE_DELIVERY_STATUS.PENDING;
  if (Object.values(MARKETPLACE_DELIVERY_STATUS).includes(v as MarketplaceDeliveryStatus)) {
    return v as MarketplaceDeliveryStatus;
  }
  const mapped = LEGACY[v];
  if (mapped) return mapped;
  return MARKETPLACE_DELIVERY_STATUS.PENDING;
}

const READY_COURIER = new Set([
  "ready_for_pickup",
  "waiting_driver",
  "accepted_for_delivery",
  "ready",
]);

export function isMarketplaceReadyCourierStatus(raw: unknown): boolean {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (READY_COURIER.has(v)) return true;
  return normalizeMarketplaceDeliveryStatus(raw)
    === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP;
}

export function isDriverPoolPublishCourierStatus(raw: unknown): boolean {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (DRIVER_POOL_PUBLISH_COURIER_STATUSES.has(v)) return true;
  const normalized = normalizeMarketplaceDeliveryStatus(raw);
  return (
    normalized === MARKETPLACE_DELIVERY_STATUS.PENDING
    || normalized === MARKETPLACE_DELIVERY_STATUS.ACCEPTED
    || normalized === MARKETPLACE_DELIVERY_STATUS.PREPARING
    || normalized === MARKETPLACE_DELIVERY_STATUS.READY_FOR_PICKUP
  );
}

export function isDriverMarketplaceVisible(raw: unknown): boolean {
  return isDriverPoolPublishCourierStatus(raw);
}

export function isDriverMarketplaceRemoved(raw: unknown): boolean {
  return REMOVED.has(normalizeMarketplaceDeliveryStatus(raw));
}

export function isPaidMarketplaceDelivery(data: {
  paymentStatus?: unknown;
  deliveryType?: unknown;
}): boolean {
  const ps =
    typeof data.paymentStatus === "string"
      ? data.paymentStatus.trim().toLowerCase()
      : "";
  return (
    data.deliveryType === "delivery"
    && (ps === "paid" || ps === "succeeded" || ps === "complete")
  );
}
