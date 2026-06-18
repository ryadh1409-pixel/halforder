import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import type Stripe from "stripe";
import {foodSharePaymentDocId} from "./foodSharePaymentLogic.js";
import {backfillFoodShareDispatchOrderIfNeeded} from "./foodShareDispatchOrder.js";
import {handleFoodSharePaymentIntentEvent} from "./foodShareWebhookHandlers.js";

function paymentDebugState(input: {
  matchId: string | null;
  match?: Record<string, unknown> | null;
  paymentStatus?: unknown;
  reason: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const {matchId, match, paymentStatus, reason, extra} = input;
  const users = Array.isArray(match?.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  const payments = (match?.userPayments ?? {}) as Record<
    string,
    {paymentStatus?: string}
  >;
  const adminFoodShareId =
    typeof match?.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : typeof match?.foodShareId === "string"
        ? match.foodShareId
        : null;
  return {
    matchId,
    lifecycle: match?.lifecycle ?? null,
    paymentStatus: paymentStatus ?? match?.paymentStatus ?? null,
    paidUsers: users.filter((u) =>
      String(payments[u]?.paymentStatus ?? "").trim().toUpperCase() === "PAID",
    ),
    users,
    adminFoodShareId,
    restaurantId:
      typeof match?.restaurantId === "string" ? match.restaurantId : adminFoodShareId,
    stripeAccountId:
      typeof match?.stripeAccountId === "string" ? match.stripeAccountId : null,
    reason,
    ...(extra ?? {}),
  };
}

async function readDocOrLogMissing(
  db: admin.firestore.Firestore,
  path: string,
): Promise<admin.firestore.DocumentSnapshot> {
  console.log("[PAYMENT READ]", path);
  const snap = await db.doc(path).get();
  console.log("[PAYMENT DOC EXISTS]", path, snap.exists);
  if (!snap.exists) {
    console.error("[PAYMENT MISSING DOC]", path, {
      exists: false,
      data: null,
    });
  }
  return snap;
}

export async function confirmFoodSharePaymentCore(input: {
  payload: Record<string, unknown>;
  uid: string;
  stripe: Stripe;
}): Promise<Record<string, unknown>> {
  const {payload, uid, stripe} = input;
  const matchId =
    typeof payload.matchId === "string" ? payload.matchId.trim() : "";
  let paymentIntentId =
    typeof payload.paymentIntentId === "string"
      ? payload.paymentIntentId.trim()
      : "";

  if (!matchId) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId: null,
      reason: "confirm_missing_match_id",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "invalid-argument",
      "matchId is required.",
    );
  }

  const db = admin.firestore();
  const matchPath = `matches/${matchId}`;
  const matchSnap = await readDocOrLogMissing(db, matchPath);
  if (!matchSnap.exists) {
    console.error("[PAYMENT MISSING DOC]", matchPath, {
      matchId,
      uid,
      reason: "match_not_found_before_confirm",
    });
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match: null,
      reason: "match_not_found_before_confirm_throw",
      extra: {uid, matchPath},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Match not found.",
    );
  }

  const match = matchSnap.data() ?? {};
  if (match.status === "CANCELLED" || match.lifecycle === "CANCELLED") {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "confirm_match_cancelled",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This food share was cancelled.",
    );
  }
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (!users.includes(uid)) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "confirm_user_not_in_match",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not part of this match.",
    );
  }

  if (!paymentIntentId) {
    const paymentId = foodSharePaymentDocId(matchId, uid);
    const paymentPath = `payments/${paymentId}`;
    const paymentSnap = await readDocOrLogMissing(db, paymentPath);
    paymentIntentId =
      typeof paymentSnap.data()?.stripePaymentIntentId === "string"
        ? paymentSnap.data()?.stripePaymentIntentId.trim()
        : "";
  }
  if (!paymentIntentId) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "confirm_missing_payment_intent_id",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "invalid-argument",
      "paymentIntentId is required.",
    );
  }

  await db.doc(matchPath).set(
    {
      lifecycle: "WAITING_FOR_PAYMENT_CONFIRMATION",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  if (metadata.matchId?.trim() !== matchId) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      paymentStatus: pi.status,
      reason: "confirm_payment_match_mismatch",
      extra: {uid, paymentIntentId: pi.id, metadata},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payment does not match this share.",
    );
  }
  if (metadata.userId?.trim() !== uid) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      paymentStatus: pi.status,
      reason: "confirm_payment_user_mismatch",
      extra: {uid, paymentIntentId: pi.id, metadata},
    }));
    throw new functions.https.HttpsError(
      "permission-denied",
      "Payment belongs to another user.",
    );
  }
  if (pi.status !== "succeeded") {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      paymentStatus: pi.status,
      reason: "confirm_payment_not_succeeded",
      extra: {uid, paymentIntentId: pi.id},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Payment not completed yet (status: ${pi.status}).`,
    );
  }

  const syntheticEvent = {
    id: `client_confirm_${pi.id}`,
    type: "payment_intent.succeeded",
    data: {object: pi},
  } as unknown as Stripe.Event;

  console.log("[PAYMENT COMPLETED]", {
    matchId,
    userId: uid,
    paymentIntentId: pi.id,
    source: "client_confirm",
  });

  const handled = await handleFoodSharePaymentIntentEvent(syntheticEvent, pi, stripe);
  if (!handled) {
    const latestMatchSnap = await db.doc(matchPath).get();
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match: latestMatchSnap.data() ?? match,
      paymentStatus: pi.status,
      reason: "confirm_food_share_event_not_handled",
      extra: {uid, paymentIntentId: pi.id},
    }));
    throw new functions.https.HttpsError(
      "internal",
      "Could not apply food share payment.",
    );
  }

  let dispatchResult: Awaited<
    ReturnType<typeof backfillFoodShareDispatchOrderIfNeeded>
  > = null;
  try {
    dispatchResult = await backfillFoodShareDispatchOrderIfNeeded(matchId);
  } catch (error) {
    console.error("[FOOD SHARE ORDER ERROR]", {
      matchId,
      phase: "confirm_backfill",
      message: error instanceof Error ? error.message : String(error),
      error,
    });
  }

  const updated = await db.doc(matchPath).get();
  const lifecycle =
    typeof updated.data()?.lifecycle === "string"
      ? updated.data()?.lifecycle
      : null;

  return {
    ok: true,
    lifecycle,
    paymentIntentId: pi.id,
    orderId: dispatchResult?.orderId ?? updated.data()?.orderId ?? null,
    orderCreated: dispatchResult?.created ?? false,
    poolExists: dispatchResult?.poolExists ?? false,
  };
}
