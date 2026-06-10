import {getFirestore} from "firebase-admin/firestore";

const BLOCK_STATUSES = ["completed", "delivered", "picked_up", "ready_for_pickup"] as const;
const BLOCK_STATUS_SET = new Set<string>(BLOCK_STATUSES);

function normStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isWebhookOrderWriteBlockedForData(
  orderId: string,
  data: Record<string, unknown>,
): boolean {
  const currentStatus = normStatus(data.status);
  const currentDeliveryStatus = normStatus(data.deliveryStatus);

  if (
    BLOCK_STATUS_SET.has(currentStatus) ||
    BLOCK_STATUS_SET.has(currentDeliveryStatus) ||
    data.earningsRecorded === true ||
    data.marketplaceArchived === true
  ) {
    console.log("[WEBHOOK GUARD] Blocked overwrite", {
      orderId,
      currentStatus: data.status ?? null,
      currentDeliveryStatus: data.deliveryStatus ?? null,
      earningsRecorded: data.earningsRecorded ?? null,
    });
    return true;
  }
  return false;
}

export async function isWebhookOrderWriteBlocked(orderId: string): Promise<boolean> {
  const db = getFirestore();
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) return false;
  return isWebhookOrderWriteBlockedForData(orderId, snap.data() ?? {});
}

export async function assertWebhookCanWriteOrder(orderId: string): Promise<boolean> {
  if (await isWebhookOrderWriteBlocked(orderId)) return false;
  return true;
}
