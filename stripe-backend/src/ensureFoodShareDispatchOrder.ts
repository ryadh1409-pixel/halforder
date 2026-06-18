import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import type {CallableContext} from "firebase-functions/v1/https";
import {backfillFoodShareDispatchOrderIfNeeded} from "./foodShareDispatchOrder.js";

function isPaidStatus(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "PAID";
}

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
    paidUsers: users.filter((u) => isPaidStatus(payments[u]?.paymentStatus)),
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

/** Ensures orders/{matchId} exists for a fully-paid food-share match (idempotent). */
export const ensureFoodShareDispatchOrder = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    let matchId: string | null = null;
    try {
      if (!context.auth) {
        logger.error("PAYMENT_STATE", paymentDebugState({
          matchId: null,
          reason: "ensure_dispatch_unauthenticated",
        }));
        throw new functions.https.HttpsError("unauthenticated", "Login required");
      }
      const payload =
        data !== null && typeof data === "object"
          ? (data as Record<string, unknown>)
          : {};
      matchId =
        typeof payload.matchId === "string" ? payload.matchId.trim() : "";
      if (!matchId) {
        logger.error("PAYMENT_STATE", paymentDebugState({
          matchId: null,
          reason: "ensure_dispatch_missing_match_id",
          extra: {uid: context.auth.uid},
        }));
        throw new functions.https.HttpsError(
          "invalid-argument",
          "matchId is required.",
        );
      }

      const result = await backfillFoodShareDispatchOrderIfNeeded(matchId);
      if (!result) {
        const matchSnap = await admin.firestore().doc(`matches/${matchId}`).get();
        const match = matchSnap.data() ?? null;
        logger.error("PAYMENT_STATE", paymentDebugState({
          matchId,
          match,
          reason: "ensure_dispatch_failed_precondition",
          extra: {
            uid: context.auth.uid,
            userPayments: match?.userPayments ?? null,
            match,
          },
        }));
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Match is not fully paid or not found.",
        );
      }

      const db = admin.firestore();
      const orderSnap = await db.doc(`orders/${result.orderId}`).get();
      const order = orderSnap.data() ?? {};

      return {
        ok: true,
        orderId: result.orderId,
        orderCreated: result.created,
        orderRepaired: result.repaired ?? false,
        poolExists: result.poolExists,
        orderPath: `orders/${result.orderId}`,
        poolPath: `driver_marketplace_pool/${result.orderId}`,
        deliveryAddress: order.deliveryAddress ?? null,
        restaurantAddress: order.restaurantAddress ?? null,
        customerPhone: order.customerPhone ?? order.customerPhoneNumber ?? null,
        pickupName: order.pickupName ?? null,
        pickupPhone: order.pickupPhone ?? null,
        pickupAddress: order.pickupAddress ?? null,
        pickupLat: order.pickupLat ?? null,
        pickupLng: order.pickupLng ?? null,
        dropoffName: order.dropoffName ?? null,
        dropoffPhone: order.dropoffPhone ?? null,
        dropoffAddress: order.dropoffAddress ?? null,
        dropoffLat: order.dropoffLat ?? null,
        dropoffLng: order.dropoffLng ?? null,
        items: order.items ?? [],
      };
    } catch (error) {
      logger.error("FOOD_SHARE_CONFIRM_FATAL", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        matchId,
      });
      throw error;
    }
  });
