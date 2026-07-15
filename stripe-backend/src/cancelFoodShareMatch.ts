import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import {refundFoodSharePaymentsForMatch} from "./foodShareWebhookHandlers.js";

defineSecret("STRIPE_SECRET_KEY");

const DRIVER_ACTIVE_LIFECYCLES = new Set([
  "DRIVER_ASSIGNED",
  "PICKED_UP",
  "DELIVERED",
  "COMPLETED",
]);

function hasAssignedDriver(data: Record<string, unknown>): boolean {
  const driverId =
    typeof data.driverId === "string" ? data.driverId.trim() : "";
  const assignedDriverId =
    typeof data.assignedDriverId === "string" ?
      data.assignedDriverId.trim() :
      "";
  const deliveryStatus =
    typeof data.deliveryStatus === "string" ?
      data.deliveryStatus.trim().toLowerCase() :
      "";
  return Boolean(
    driverId ||
      assignedDriverId ||
      deliveryStatus === "driver_assigned" ||
      deliveryStatus === "picked_up" ||
      deliveryStatus === "delivered",
  );
}

function hasSubmittedPayment(
  userPayments: unknown,
): boolean {
  const payments =
    userPayments && typeof userPayments === "object"
      ? (userPayments as Record<string, {paymentStatus?: unknown}>)
      : {};
  return Object.values(payments).some(
    (payment) =>
      String(payment?.paymentStatus ?? "").trim().toUpperCase() === "PAID",
  );
}

async function writeServerAudit(input: {
  action: string;
  actorUid: string;
  targetUid?: string | null;
  matchId?: string | null;
  adminFoodShareId?: string | null;
  cancelReason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await admin.firestore().collection("moderationAuditLog").add({
    action: input.action,
    actorUid: input.actorUid,
    targetUid: input.targetUid ?? null,
    matchId: input.matchId ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
    cancelReason: input.cancelReason ?? null,
    metadata: input.metadata ?? {},
    source: "food_share",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function cancelWaitingShare(
  uid: string,
  adminFoodShareId: string,
): Promise<{ok: true}> {
  const db = admin.firestore();
  const queueRef = db.doc(`matchQueues/${adminFoodShareId}`);
  const requestRef = db.doc(`matchRequests/${adminFoodShareId}_${uid}`);

  await db.runTransaction(async (tx) => {
    const [queueSnap, requestSnap] = await Promise.all([
      tx.get(queueRef),
      tx.get(requestRef),
    ]);
    if (!requestSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Join request not found.");
    }
    const req = requestSnap.data() ?? {};
    if (req.status === "CANCELLED") return;
    if (req.status === "MATCHED") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Already matched — cancel the match instead.",
      );
    }
    if (req.status !== "WAITING") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Nothing to cancel.",
      );
    }

    tx.set(
      requestRef,
      {
        status: "CANCELLED",
        lifecycle: "CANCELLED",
        cancelReason: "CANCELLED_BY_USER",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    if (
      queueSnap.exists &&
      queueSnap.data()?.waitingUserId === uid
    ) {
      tx.set(
        queueRef,
        {
          waitingUserId: null,
          waitingUserFirstName: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
  });

  await writeServerAudit({
    action: "share_cancelled_waiting",
    actorUid: uid,
    adminFoodShareId,
    cancelReason: "CANCELLED_BY_USER",
  });

  return {ok: true};
}

async function cancelActiveMatch(
  uid: string,
  matchId: string,
  cancelReason: "CANCELLED_BY_USER" | "CANCELLED_BY_ADMIN",
): Promise<{ok: true; refundAttempted: boolean}> {
  const db = admin.firestore();
  const matchRef = db.doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Match not found.");
  }
  const match = matchSnap.data() ?? {};
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (!users.includes(uid) && cancelReason !== "CANCELLED_BY_ADMIN") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Not a match participant.",
    );
  }

  const lifecycle = String(match.lifecycle ?? "");
  if (lifecycle === "CANCELLED" || match.status === "CANCELLED") {
    return {ok: true, refundAttempted: false};
  }
  if (
    lifecycle === "WAITING_FOR_PAYMENT_CONFIRMATION" &&
    hasSubmittedPayment(match.userPayments)
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payment already submitted and cannot be cancelled from the app.",
    );
  }
  const orderStatus = match.orderStatus;
  const canCancelWithOrderStatus =
    lifecycle === "PAYMENT_CONFIRMED" || lifecycle === "ORDER_PLACED";
  if (
    DRIVER_ACTIVE_LIFECYCLES.has(lifecycle) ||
    (typeof orderStatus === "string" &&
      orderStatus.trim() !== "" &&
      !canCancelWithOrderStatus)
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Cannot cancel after order placement.",
    );
  }

  const orderId =
    typeof match.orderId === "string" && match.orderId.trim()
      ? match.orderId.trim()
      : lifecycle === "ORDER_PLACED"
        ? matchId
        : "";
  const orderRef = orderId ? db.doc(`orders/${orderId}`) : null;
  const orderSnap = orderRef ? await orderRef.get() : null;
  if (
    (lifecycle === "ORDER_PLACED" || orderSnap?.exists) &&
    hasAssignedDriver({
      ...match,
      ...(orderSnap?.exists ? orderSnap.data() ?? {} : {}),
    })
  ) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Cannot cancel after a driver has been assigned.",
    );
  }

  const partnerUid = users.find((u) => u !== uid) ?? null;
  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : typeof match.foodShareId === "string"
        ? match.foodShareId
        : null;

  await matchRef.set(
    {
      status: "CANCELLED",
      lifecycle: "CANCELLED",
      cancelledBy: uid,
      cancelReason,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  if (adminFoodShareId) {
    for (const userId of users) {
      const reqRef = db.doc(`matchRequests/${adminFoodShareId}_${userId}`);
      const reqSnap = await reqRef.get();
      if (reqSnap.exists) {
        await reqRef.set(
          {
            status: "CANCELLED",
            lifecycle: "CANCELLED",
            cancelReason:
              userId === uid ? cancelReason : "CANCELLED_BY_PARTNER",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }
    }
    await db.doc(`matchQueues/${adminFoodShareId}`).set(
      {
        waitingUserId: null,
        waitingUserFirstName: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  if (orderRef && orderSnap?.exists) {
    await orderRef.set(
      {
        status: "cancelled",
        deliveryStatus: "cancelled",
        lifecycle: "CANCELLED",
        marketplaceArchived: true,
        cancelledBy: uid,
        cancelReason,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    await db.doc(`driver_marketplace_pool/${orderId}`).set(
      {
        status: "cancelled",
        deliveryStatus: "cancelled",
        lifecycle: "CANCELLED",
        archived: true,
        marketplaceArchived: true,
        cancelledBy: uid,
        cancelReason,
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  let refundAttempted = false;
  try {
    await refundFoodSharePaymentsForMatch(matchId);
    refundAttempted = true;
    await writeServerAudit({
      action: "refund_requested",
      actorUid: uid,
      targetUid: partnerUid,
      matchId,
      adminFoodShareId,
      cancelReason,
    });
  } catch (e) {
    console.warn("[cancelFoodShareMatch] refund failed", matchId, e);
  }

  await writeServerAudit({
    action: "match_cancelled",
    actorUid: uid,
    targetUid: partnerUid,
    matchId,
    adminFoodShareId,
    cancelReason,
    metadata: {refundAttempted},
  });

  return {ok: true, refundAttempted};
}

/** Cancel a waiting share or an active food-share match (with refund pre-order). */
export const cancelFoodShareMatch = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const uid = context.auth.uid;
    const payload =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};
    const scope = payload.scope === "waiting" ? "waiting" : "match";
    const adminFoodShareId =
      typeof payload.adminFoodShareId === "string"
        ? payload.adminFoodShareId.trim()
        : "";
    const matchId =
      typeof payload.matchId === "string" ? payload.matchId.trim() : "";

    if (scope === "waiting") {
      if (!adminFoodShareId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "adminFoodShareId is required for waiting cancel.",
        );
      }
      return cancelWaitingShare(uid, adminFoodShareId);
    }

    if (!matchId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "matchId is required.",
      );
    }

    const isAdmin =
      context.auth.token?.admin === true ||
      context.auth.token?.role === "admin";
    const cancelReason =
      isAdmin && payload.asAdmin === true
        ? "CANCELLED_BY_ADMIN"
        : "CANCELLED_BY_USER";

    return cancelActiveMatch(uid, matchId, cancelReason);
  });
