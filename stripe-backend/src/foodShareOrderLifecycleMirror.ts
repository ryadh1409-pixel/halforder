import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";

const LIFECYCLE_RANK: Record<string, number> = {
  ORDER_PLACED: 1,
  DRIVER_ASSIGNED: 2,
  PICKED_UP: 3,
  DELIVERED: 4,
  COMPLETED: 5,
  CANCELLED: 99,
};

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function norm(value: unknown): string {
  return nonEmptyString(value).toLowerCase();
}

function hasDriverAssigned(order: Record<string, unknown>): boolean {
  return Boolean(nonEmptyString(order.driverId) || nonEmptyString(order.assignedDriverId));
}

export function lifecycleFromFoodShareOrder(
  order: Record<string, unknown>,
): "DRIVER_ASSIGNED" | "PICKED_UP" | "DELIVERED" | "COMPLETED" | "CANCELLED" | null {
  const status = norm(order.status);
  const deliveryStatus = norm(order.deliveryStatus);

  if (status === "cancelled" || deliveryStatus === "cancelled") {
    return "CANCELLED";
  }
  if (status === "completed") {
    return "COMPLETED";
  }
  if (deliveryStatus === "delivered" || status === "delivered") {
    return "DELIVERED";
  }
  if (status === "picked_up" || deliveryStatus === "picked_up") {
    return "PICKED_UP";
  }
  if (
    status === "driver_assigned" ||
    deliveryStatus === "driver_assigned" ||
    hasDriverAssigned(order)
  ) {
    return "DRIVER_ASSIGNED";
  }
  return null;
}

export function buildFoodShareMatchLifecyclePatch(
  order: Record<string, unknown>,
  match: Record<string, unknown>,
): Record<string, unknown> | null {
  const lifecycle = lifecycleFromFoodShareOrder(order);
  if (!lifecycle) return null;

  const currentLifecycle = nonEmptyString(match.lifecycle).toUpperCase();
  if (currentLifecycle === "CANCELLED" && lifecycle !== "CANCELLED") return null;

  const currentRank = LIFECYCLE_RANK[currentLifecycle] ?? 0;
  const nextRank = LIFECYCLE_RANK[lifecycle];
  if (nextRank < currentRank) return null;

  const patch: Record<string, unknown> = {};
  if (nextRank > currentRank || currentLifecycle !== lifecycle) {
    patch.lifecycle = lifecycle;
  }

  const deliveryStatus = nonEmptyString(order.deliveryStatus);
  if (deliveryStatus && match.deliveryStatus !== deliveryStatus) {
    patch.deliveryStatus = deliveryStatus;
  }

  const orderStatus = nonEmptyString(order.status);
  if (orderStatus && match.orderStatus !== orderStatus) {
    patch.orderStatus = orderStatus;
  }

  const driverId = nonEmptyString(order.driverId);
  if (driverId && match.driverId !== driverId) {
    patch.driverId = driverId;
  }

  const assignedDriverId = nonEmptyString(order.assignedDriverId);
  if (assignedDriverId && match.assignedDriverId !== assignedDriverId) {
    patch.assignedDriverId = assignedDriverId;
  }

  if (Object.keys(patch).length === 0) return null;
  patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.lifecycleSyncedFromOrderAt = admin.firestore.FieldValue.serverTimestamp();
  if (lifecycle === "COMPLETED") {
    patch.deliveryStatus = "delivered";
    patch.completedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  if (lifecycle === "CANCELLED") {
    patch.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
  }
  return patch;
}

const WATCHED_KEYS = [
  "matchId",
  "status",
  "deliveryStatus",
  "driverId",
  "assignedDriverId",
];

export async function handleFoodShareOrderLifecycleUpdate(
  orderId: string,
  before: Record<string, unknown>,
  order: Record<string, unknown>,
): Promise<void> {
  const matchId = nonEmptyString(order.matchId);
  if (!matchId) return;

  const changed = WATCHED_KEYS.some((key) => before[key] !== order[key]);
  if (!changed) return;

  const newLifecycle = lifecycleFromFoodShareOrder(order);
  if (!newLifecycle) return;

  const db = admin.firestore();
  const matchRef = db.doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    console.warn("[FOOD SHARE LIFECYCLE MIRROR] match missing", {
      orderId,
      matchId,
      oldLifecycle: null,
      newLifecycle,
    });
    return;
  }

  const match = matchSnap.data() ?? {};
  const oldLifecycle = nonEmptyString(match.lifecycle).toUpperCase() || null;
  const patch = buildFoodShareMatchLifecyclePatch(order, match);

  console.log("[FOOD SHARE LIFECYCLE MIRROR] transition", {
    orderId,
    matchId,
    oldLifecycle,
    newLifecycle,
    orderStatus: order.status ?? null,
    deliveryStatus: order.deliveryStatus ?? null,
  });

  if (!patch) return;

  await matchRef.set(patch, {merge: true});
  console.log("[FOOD SHARE LIFECYCLE MIRROR] match updated", {
    orderId,
    matchId,
    oldLifecycle,
    newLifecycle: patch.lifecycle ?? oldLifecycle,
    deliveryStatus: patch.deliveryStatus ?? null,
    orderStatus: patch.orderStatus ?? null,
    driverId: patch.driverId ?? null,
    assignedDriverId: patch.assignedDriverId ?? null,
  });
}

export const syncFoodShareMatchLifecycleFromOrder = functions
  .region("us-central1")
  .firestore.document("orders/{orderId}")
  .onWrite(async (change, context) => {
    const after = change.after;
    if (!after.exists) return;

    const order = after.data() ?? {};
    const before = change.before.exists ? change.before.data() ?? {} : {};
    await handleFoodShareOrderLifecycleUpdate(
      context.params.orderId,
      before,
      order,
    );
  });

export const syncFoodShareMatchLifecycleFromOrderUpdated = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const order = event.data?.after.data() ?? {};
    await handleFoodShareOrderLifecycleUpdate(
      event.params.orderId,
      before,
      order,
    );
  });
