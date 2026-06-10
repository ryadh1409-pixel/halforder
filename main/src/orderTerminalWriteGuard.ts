import {shouldBlockStripePaymentOverwrite} from "./orderPaidState.js";

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasTimestamp(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return true;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return true;
  }
  return false;
}

/**
 * Hard stop for any server-side `orders/{id}` lifecycle write (webhook, repair).
 * True when the order has reached a terminal or post-fulfillment state.
 */
export function isOrderTerminalForServerWrite(
  order: Record<string, unknown>,
): boolean {
  if (shouldBlockStripePaymentOverwrite(order)) {
    return true;
  }

  if (order.earningsRecorded === true) return true;
  if (order.marketplaceArchived === true) {
    const courier = norm(order.deliveryStatus);
    if (courier === "delivered" || courier === "completed") return true;
  }

  const kitchen = norm(order.status);
  const courier = norm(order.deliveryStatus);
  if (kitchen === "completed" || kitchen === "delivered") return true;
  if (courier === "delivered" || courier === "completed") return true;

  if (hasTimestamp(order.deliveredAt) || hasTimestamp(order.completedAt)) {
    return true;
  }

  return false;
}
