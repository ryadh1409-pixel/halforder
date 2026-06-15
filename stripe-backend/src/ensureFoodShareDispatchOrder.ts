import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {backfillFoodShareDispatchOrderIfNeeded} from "./foodShareDispatchOrder.js";

/** Ensures orders/{matchId} exists for a fully-paid food-share match (idempotent). */
export const ensureFoodShareDispatchOrder = functions
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

    const result = await backfillFoodShareDispatchOrderIfNeeded(matchId);
    if (!result) {
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
  });
