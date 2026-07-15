import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import {refundFoodSharePaymentsForMatch} from "./foodShareWebhookHandlers.js";

defineSecret("STRIPE_SECRET_KEY");

/** Refund all paid food-share payments when a match is cancelled pre-order. */
export const refundFoodShareMatch = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const payload =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};
    const matchId =
      typeof payload.matchId === "string" ? payload.matchId.trim() : "";
    if (!matchId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "matchId is required.",
      );
    }

    const admin = await import("firebase-admin");
    const matchSnap = await admin.firestore().doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Match not found.");
    }
    const users = Array.isArray(matchSnap.data()?.users)
      ? (matchSnap.data()?.users as string[])
      : [];
    if (!users.includes(context.auth.uid)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Not a match participant.",
      );
    }

    const lifecycle = String(matchSnap.data()?.lifecycle ?? "");
    const orderStatus = matchSnap.data()?.orderStatus;
    if (
      lifecycle === "ORDER_PLACED" ||
      (orderStatus != null && String(orderStatus).trim() !== "")
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cannot auto-refund after order placement.",
      );
    }

    await refundFoodSharePaymentsForMatch(matchId);
    return {ok: true};
  });
