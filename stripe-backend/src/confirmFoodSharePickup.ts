/**
 * Confirm restaurant pickup and release the joiner's held payment to reimburse the host.
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import * as logger from "firebase-functions/logger";

function db() {
  return admin.firestore();
}

export async function confirmFoodSharePickupHandler(
  data: unknown,
  context: CallableContext,
): Promise<{ok: true; reimbursementStatus: "RELEASED"}> {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Sign in required.",
    );
  }
  const uid = context.auth.uid;
  const matchId =
    data &&
    typeof data === "object" &&
    typeof (data as {matchId?: unknown}).matchId === "string"
      ? (data as {matchId: string}).matchId.trim()
      : "";
  if (!matchId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "matchId is required.",
    );
  }

  const matchRef = db().doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Match not found.");
  }
  const match = matchSnap.data() ?? {};
  if (match.fulfillmentMode !== "pickup") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This match is not a pickup share.",
    );
  }

  const hostUid =
    typeof match.pickupHostUid === "string" ? match.pickupHostUid : "";
  const joinerUid =
    typeof match.pickupJoinerUid === "string" ? match.pickupJoinerUid : "";
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (!users.includes(uid)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only match participants can confirm pickup.",
    );
  }
  if (hostUid && uid !== hostUid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only the pickup host can confirm restaurant pickup.",
    );
  }

  const payments = (match.userPayments ?? {}) as Record<
    string,
    {paymentStatus?: string; amount?: number}
  >;
  const joinerPaid =
    String(payments[joinerUid]?.paymentStatus ?? "")
      .toUpperCase() === "PAID";
  if (!joinerPaid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Wait for your partner to pay their share before confirming pickup.",
    );
  }

  if (match.pickupReimbursementStatus === "RELEASED") {
    return {ok: true, reimbursementStatus: "RELEASED"};
  }

  const amount =
    typeof payments[joinerUid]?.amount === "number"
      ? payments[joinerUid].amount
      : typeof match.costBreakdown === "object" &&
          match.costBreakdown &&
          typeof (match.costBreakdown as {grandTotal?: unknown}).grandTotal ===
            "number"
        ? (match.costBreakdown as {grandTotal: number}).grandTotal
        : 0;

  const now = admin.firestore.FieldValue.serverTimestamp();
  await matchRef.set(
    {
      pickupReimbursementStatus: "RELEASED",
      pickupConfirmedAt: now,
      pickupConfirmedAtMs: Date.now(),
      pickupConfirmedBy: uid,
      lifecycle: "PICKED_UP",
      deliveryStatus: "picked_up",
      orderStatus: "picked_up",
      updatedAt: now,
    },
    {merge: true},
  );

  await db()
    .doc(`pickupReimbursements/${matchId}`)
    .set(
      {
        matchId,
        hostUid: hostUid || uid,
        joinerUid,
        amount,
        currency: "cad",
        status: "RELEASED",
        releasedAt: now,
        createdAt: now,
        note:
          "Joiner payment held by HalfOrder and released to reimburse the host after pickup confirmation.",
      },
      {merge: true},
    );

  logger.info("PICKUP_REIMBURSEMENT_RELEASED", {
    matchId,
    hostUid,
    joinerUid,
    amount,
  });

  return {ok: true, reimbursementStatus: "RELEASED"};
}

export const confirmFoodSharePickup = functions
  .region("us-central1")
  .https.onCall(confirmFoodSharePickupHandler);
