/**
 * Repairs marketplace orders stuck at assigned-but-never-completed after driver claim.
 * Does not touch in-progress deliveries younger than STALE_ASSIGNED_MS.
 */
import {FieldValue, getFirestore, type DocumentData} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {prepareServerOrderPatch} from "./serverOrderWrite.js";
import {isOrderTerminalForServerWrite} from "./orderTerminalWriteGuard.js";
import {timestampToMillis} from "./orderExpiry.js";

const db = getFirestore();

/** Default: 48h — assigned orders older than this with no fulfillment progress are stale. */
export const STALE_ASSIGNED_MS = Number(
  process.env.STALE_ASSIGNED_MS ?? 48 * 60 * 60 * 1000,
);

const STALE_KITCHEN_STATUSES = new Set([
  "payment_confirmed",
  "pending_driver",
  "driver_assigned",
  "pending",
]);

const STALE_COURIER_STATUSES = new Set(["driver_assigned", "pending"]);

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasAssignedDriver(data: DocumentData): boolean {
  const driverId = norm(data.driverId);
  const assigned = norm(data.assignedDriverId);
  return driverId.length > 0 || assigned.length > 0;
}

function lastActivityMs(data: DocumentData): number | null {
  const candidates = [
    timestampToMillis(data.updatedAt),
    timestampToMillis(data.acceptedAt),
    timestampToMillis(data.createdAt),
    timestampToMillis(data.paidAt),
  ].filter((ms): ms is number => ms != null && ms > 0);
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

/** True when order is assigned, pre-terminal, and stale with no forward fulfillment. */
export function isStaleAssignedMarketplaceDelivery(
  data: DocumentData,
  nowMs: number = Date.now(),
  staleMs: number = STALE_ASSIGNED_MS,
): boolean {
  if (!hasAssignedDriver(data)) return false;
  if (isOrderTerminalForServerWrite(data)) return false;
  if (data.earningsRecorded === true || data.marketplaceArchived === true) return false;
  if (data.expired === true) return false;

  const kitchen = norm(data.status);
  const courier = norm(data.deliveryStatus);
  if (!STALE_KITCHEN_STATUSES.has(kitchen)) return false;
  if (!STALE_COURIER_STATUSES.has(courier)) return false;

  const activityMs = lastActivityMs(data);
  if (activityMs == null) return false;
  return nowMs - activityMs >= staleMs;
}

export function buildStaleDeliveryTerminalPatch(updatedBy: string): Record<string, unknown> {
  return {
    status: "completed",
    deliveryStatus: "delivered",
    deliveredAt: FieldValue.serverTimestamp(),
    completedAt: FieldValue.serverTimestamp(),
    marketplaceArchived: true,
    earningsRecorded: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: updatedBy,
  };
}

export async function repairStaleMarketplaceDeliveryIfNeeded(
  orderId: string,
  data: DocumentData,
  options?: {staleMs?: number; nowMs?: number; updatedBy?: string},
): Promise<boolean> {
  const staleMs = options?.staleMs ?? STALE_ASSIGNED_MS;
  const nowMs = options?.nowMs ?? Date.now();
  const updatedBy = options?.updatedBy ?? "repairStaleMarketplaceDeliveries";

  if (!isStaleAssignedMarketplaceDelivery(data, nowMs, staleMs)) {
    return false;
  }

  const orderRef = db.doc(`orders/${orderId}`);
  const requested = buildStaleDeliveryTerminalPatch(updatedBy);
  const safePatch = prepareServerOrderPatch(orderId, data, requested, updatedBy);

  if (
    safePatch.status !== "completed" &&
    safePatch.deliveryStatus !== "delivered"
  ) {
    logger.warn("[stale-delivery-repair] patch_blocked", {
      orderId,
      currentStatus: data.status ?? null,
      currentDeliveryStatus: data.deliveryStatus ?? null,
      safePatch,
    });
    return false;
  }

  console.log("[DELIVERY COMPLETE] before", {
    orderId,
    source: `${updatedBy}#repairStaleMarketplaceDeliveryIfNeeded`,
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    marketplaceArchived: data.marketplaceArchived ?? null,
    earningsRecorded: data.earningsRecorded ?? null,
  });

  await orderRef.set(safePatch, {merge: true});

  console.log("[DELIVERY COMPLETE] after", {
    orderId,
    source: `${updatedBy}#repairStaleMarketplaceDeliveryIfNeeded`,
    wrote: true,
    status: "completed",
    deliveryStatus: "delivered",
    marketplaceArchived: true,
    earningsRecorded: true,
  });

  logger.info("[stale-delivery-repair] applied", {orderId, updatedBy});
  return true;
}

/** Scan assigned stale delivery orders and terminalize them (scheduled / admin). */
export async function repairStaleAssignedDeliveriesBatch(
  options?: {limit?: number; staleMs?: number},
): Promise<number> {
  const limit = options?.limit ?? 100;
  const staleMs = options?.staleMs ?? STALE_ASSIGNED_MS;
  const nowMs = Date.now();
  let repaired = 0;

  const snap = await db
    .collection("orders")
    .where("deliveryType", "==", "delivery")
    .where("deliveryStatus", "==", "driver_assigned")
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isStaleAssignedMarketplaceDelivery(data, nowMs, staleMs)) continue;
    const applied = await repairStaleMarketplaceDeliveryIfNeeded(doc.id, data, {
      staleMs,
      nowMs,
      updatedBy: "repairStaleAssignedDeliveriesBatch",
    });
    if (applied) repaired += 1;
  }

  return repaired;
}
