import {getFirestore} from "firebase-admin/firestore";

const BLOCK_STATUSES = ["completed", "delivered", "picked_up", "ready_for_pickup"] as const;
const BLOCK_STATUS_SET = new Set<string>(BLOCK_STATUSES);

function normStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** True when in-memory order data must not receive any webhook lifecycle write. */
export function isWebhookOrderWriteBlockedForData(
  orderId: string,
  data: Record<string, unknown>,
): boolean {
  const currentStatus = normStatus(data.status);
  const currentDeliveryStatus = normStatus(data.deliveryStatus);

  if (
    BLOCK_STATUS_SET.has(currentStatus) ||
    BLOCK_STATUS_SET.has(currentDeliveryStatus)
  ) {
    console.log("[WEBHOOK GUARD] Blocked overwrite", {
      orderId,
      currentStatus: data.status ?? null,
      currentDeliveryStatus: data.deliveryStatus ?? null,
    });
    return true;
  }
  return false;
}

/**
 * Read current server state before any `orders/{id}` write.
 * Returns `true` when the webhook must skip the order write entirely.
 */
export async function isWebhookOrderWriteBlocked(orderId: string): Promise<boolean> {
  const db = getFirestore();
  const currentOrder = await db.collection("orders").doc(orderId).get();
  if (!currentOrder.exists) {
    return false;
  }
  return isWebhookOrderWriteBlockedForData(orderId, currentOrder.data() ?? {});
}

/**
 * Read current server state before any `orders/{id}` write.
 * Returns `false` when the write must be skipped entirely.
 */
export async function assertWebhookCanWriteOrder(orderId: string): Promise<boolean> {
  if (await isWebhookOrderWriteBlocked(orderId)) {
    return false;
  }
  return true;
}
