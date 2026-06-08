import {getFirestore} from "firebase-admin/firestore";
import {isDriverFulfillmentAdvanced} from "./driverFulfillmentGuard.js";
import {hasFulfillmentProgressMarkers} from "./orderFulfillmentSignals.js";

/** Kitchen/courier stages where Stripe webhook must not touch `orders/{id}`. */
export const WEBHOOK_BLOCK_STATUSES = [
  "accepted",
  "preparing",
  "ready_for_pickup",
  "driver_assigned",
  "picked_up",
  "delivered",
  "completed",
  "cancelled",
] as const;

const BLOCK_STATUS_SET = new Set<string>(WEBHOOK_BLOCK_STATUSES);

function normStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when in-memory order data must not receive any webhook lifecycle write. */
export function isWebhookOrderWriteBlockedForData(
  orderId: string,
  data: Record<string, unknown>,
): boolean {
  if (data.earningsRecorded === true || data.marketplaceArchived === true) {
    console.log("[STRIPE BLOCKED]", orderId, data.status ?? null, data.deliveryStatus ?? null, "fulfillment_markers");
    return true;
  }

  if (hasFulfillmentProgressMarkers(data) || isDriverFulfillmentAdvanced(data.deliveryStatus)) {
    return true;
  }

  const status = normStatus(data.status);
  const deliveryStatus = normStatus(data.deliveryStatus);
  if (BLOCK_STATUS_SET.has(status) || BLOCK_STATUS_SET.has(deliveryStatus)) {
    return true;
  }
  return false;
}

/** Log + short-circuit before any merge write on fulfilled orders (retry events). */
export function logBlockedFulfilledWebhookWrite(
  orderId: string,
  data: Record<string, unknown>,
): void {
  console.log("[stripeWebhook] BLOCKED retry event - order already fulfilled", {
    orderId,
    currentStatus: data.status ?? null,
    currentDeliveryStatus: data.deliveryStatus ?? null,
  });
}

/**
 * Read current server state before any `orders/{id}` write.
 * Returns `true` when the webhook must skip the order write entirely.
 */
export async function isWebhookOrderWriteBlocked(orderId: string): Promise<boolean> {
  const db = getFirestore();
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) {
    return false;
  }
  return isWebhookOrderWriteBlockedForData(orderId, snap.data() ?? {});
}

/**
 * Read current server state before any `orders/{id}` write.
 * Returns `false` when the write must be skipped entirely.
 */
export async function assertWebhookCanWriteOrder(orderId: string): Promise<boolean> {
  const db = getFirestore();
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    console.log("[STRIPE BLOCKED]", orderId, null, null, "missing");
    return false;
  }
  const data = snap.data() ?? {};
  return !isWebhookOrderWriteBlockedForData(orderId, data);
}
