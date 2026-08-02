/**
 * Single source of truth for driver_marketplace_pool insert/remove (Cloud Functions).
 */
import type {DocumentData} from "firebase-admin/firestore";
import {isMarketplaceOrderExpiredByAge, resolveMarketplaceCreatedAtMs} from "./orderExpiry.js";
import {
  isDriverMarketplaceRemoved,
  isDriverPoolPublishCourierStatus,
  isPaidMarketplaceDelivery,
  normalizeMarketplaceDeliveryStatus,
} from "./marketplaceDeliveryStatus.js";

const KITCHEN_TERMINAL = new Set(["cancelled", "rejected"]);

export type MarketplacePublishDebug = {
  orderId: string;
  deliveryType: unknown;
  paymentStatus: unknown;
  kitchenStatus: string;
  courierStatus: unknown;
  normalizedCourier: string;
  driverId: unknown;
  assignedDriverId: unknown;
  expired: unknown;
  marketplaceArchived: unknown;
  createdAtMs: number | null;
  shouldPublishToMarketplace: boolean;
  rejectReason: string | null;
  checks: Record<string, boolean>;
};

export function hasDriverAssigned(data: DocumentData): boolean {
  const driverId = data.driverId;
  const assignedDriverId = data.assignedDriverId;
  return (
    (typeof driverId === "string" && driverId.length > 0)
    || (typeof assignedDriverId === "string" && assignedDriverId.length > 0)
  );
}

/**
 * True only after a real driver claim/accept — not bare driverId leftovers.
 * Kitchen ready_for_pickup + stale driverId must NOT count as assigned.
 */
export function hasMarketplaceDriverClaimed(data: DocumentData): boolean {
  if (!hasDriverAssigned(data)) return false;

  const status = kitchenStatus(data).trim().toLowerCase();
  const courierRaw =
    typeof data.deliveryStatus === "string" ? data.deliveryStatus.trim().toLowerCase() : "";
  const courier = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);

  if (
    status === "driver_assigned" ||
    status === "picked_up" ||
    status === "delivered" ||
    status === "completed" ||
    courier === "driver_assigned" ||
    courier === "picked_up" ||
    courier === "delivered" ||
    courier === "cancelled"
  ) {
    return true;
  }

  if (
    courierRaw === "heading_to_restaurant" ||
    courierRaw === "arrived_restaurant" ||
    courierRaw === "arriving_restaurant" ||
    courierRaw === "driver_at_restaurant" ||
    courierRaw === "on_the_way" ||
    courierRaw === "near_customer" ||
    courierRaw === "driver_accepted" ||
    courierRaw === "driver_on_way"
  ) {
    return true;
  }

  // Driver arrived uses ready_for_pickup but claim always writes deliveryPin.
  const pin = typeof data.deliveryPin === "string" ? data.deliveryPin.trim() : "";
  if (/^\d{4}$/.test(pin)) return true;

  return false;
}

function kitchenStatus(data: DocumentData): string {
  return typeof data.status === "string" ? data.status : "";
}

function isKitchenTerminalForPool(data: DocumentData): boolean {
  const ks = kitchenStatus(data).trim().toLowerCase();
  if (KITCHEN_TERMINAL.has(ks)) return true;
  if (ks === "delivered" || ks === "completed") return true;
  const ds = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  return ds === "delivered" || ds === "cancelled";
}

export function isPoolExpiredByAge(data: DocumentData): boolean {
  return isMarketplaceOrderExpiredByAge(data);
}

export function isExplicitlyBlockedFromPool(data: DocumentData): boolean {
  if (data.marketplaceArchived === true) return true;
  if (data.expired === true && isPoolExpiredByAge(data)) return true;
  return false;
}

function isCourierStatusPoolEligible(data: DocumentData): boolean {
  return isDriverPoolPublishCourierStatus(data.deliveryStatus);
}

export function shouldPublishToDriverPool(data: DocumentData): boolean {
  if (data.deliveryType !== "delivery") return false;
  if (!isPaidMarketplaceDelivery(data)) return false;
  // Real claim OR any leftover driver id blocks publish until cleared.
  if (hasMarketplaceDriverClaimed(data)) return false;
  if (hasDriverAssigned(data)) return false;
  if (isExplicitlyBlockedFromPool(data)) return false;
  if (isPoolExpiredByAge(data)) return false;
  if (isKitchenTerminalForPool(data)) return false;
  if (isDriverMarketplaceRemoved(data.deliveryStatus)) return false;
  return isCourierStatusPoolEligible(data);
}

export function evaluateMarketplacePublishDebug(
  orderId: string,
  data: DocumentData,
): MarketplacePublishDebug {
  const normalizedCourier = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  const checks = {
    isDelivery: data.deliveryType === "delivery",
    isPaid: isPaidMarketplaceDelivery(data),
    noDriver: !hasMarketplaceDriverClaimed(data) && !hasDriverAssigned(data),
    notBlocked: !isExplicitlyBlockedFromPool(data),
    notExpiredByAge: !isPoolExpiredByAge(data),
    notKitchenTerminal: !isKitchenTerminalForPool(data),
    notCourierRemoved: !isDriverMarketplaceRemoved(data.deliveryStatus),
    courierEligible: isCourierStatusPoolEligible(data),
  };

  let rejectReason: string | null = null;
  if (!checks.isDelivery) rejectReason = "not_delivery";
  else if (!checks.isPaid) rejectReason = "not_paid";
  else if (!checks.noDriver) rejectReason = "driver_assigned";
  else if (!checks.notBlocked) {
    rejectReason = data.marketplaceArchived === true
      ? "marketplace_archived"
      : "expired_flag";
  } else if (!checks.notExpiredByAge) rejectReason = "expired_age";
  else if (!checks.notKitchenTerminal) rejectReason = `kitchen:${kitchenStatus(data)}`;
  else if (!checks.notCourierRemoved) rejectReason = `courier_removed:${normalizedCourier}`;
  else if (!checks.courierEligible) rejectReason = `courier_not_visible:${normalizedCourier}`;

  return {
    orderId,
    deliveryType: data.deliveryType ?? null,
    paymentStatus: data.paymentStatus ?? null,
    kitchenStatus: kitchenStatus(data),
    courierStatus: data.deliveryStatus ?? null,
    normalizedCourier,
    driverId: data.driverId ?? null,
    assignedDriverId: data.assignedDriverId ?? null,
    expired: data.expired ?? false,
    marketplaceArchived: data.marketplaceArchived ?? false,
    createdAtMs: resolveMarketplaceCreatedAtMs(data),
    shouldPublishToMarketplace: rejectReason == null,
    rejectReason,
    checks,
  };
}

export function shouldRemoveFromDriverPool(data: DocumentData): boolean {
  if (hasMarketplaceDriverClaimed(data)) return true;
  if (isPoolExpiredByAge(data)) return true;
  if (data.marketplaceArchived === true) return true;
  if (isKitchenTerminalForPool(data)) return true;
  if (isDriverMarketplaceRemoved(data.deliveryStatus)) return true;
  if (data.expired === true) return true;
  return false;
}

export function marketplacePoolRemoveReason(data: DocumentData): string {
  if (hasMarketplaceDriverClaimed(data)) return "driver_assigned";
  if (data.marketplaceArchived === true) return "marketplace_archived";
  if (isKitchenTerminalForPool(data)) {
    return `kitchen:${kitchenStatus(data)}`;
  }
  const ds = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  if (isDriverMarketplaceRemoved(ds)) return `delivery:${ds}`;
  if (isPoolExpiredByAge(data)) return "expired_age";
  if (data.expired === true) return "expired_flag";
  if (data.deliveryType !== "delivery") return "not_delivery";
  if (!isPaidMarketplaceDelivery(data)) return "not_paid";
  if (!isCourierStatusPoolEligible(data)) return `delivery_not_visible:${ds}`;
  return "not_eligible";
}

export function marketplacePoolSyncStatus(data: DocumentData): Record<string, unknown> {
  const ds = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  return {
    kitchenStatus: kitchenStatus(data),
    deliveryStatus: data.deliveryStatus,
    normalizedDelivery: ds,
    paymentStatus: data.paymentStatus,
    expired: data.expired ?? false,
    marketplaceArchived: data.marketplaceArchived ?? false,
    driverId: data.driverId ?? null,
    assignedDriverId: data.assignedDriverId ?? null,
    publish: shouldPublishToDriverPool(data),
    remove: shouldRemoveFromDriverPool(data),
    removeReason: marketplacePoolRemoveReason(data),
  };
}
