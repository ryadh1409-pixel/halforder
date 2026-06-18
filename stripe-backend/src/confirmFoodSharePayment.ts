import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {confirmFoodSharePaymentCore} from "./confirmFoodSharePaymentCore.js";

const stripeSecret = defineSecret("STRIPE_SECRET_KEY");

let stripeSingleton: Stripe | null = null;

function getStripe(): Stripe {
  const key = stripeSecret.value();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {apiVersion: "2025-02-24.acacia"});
  }
  return stripeSingleton;
}

export const confirmFoodSharePayment = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    try {
      if (!context.auth) {
        logger.error("PAYMENT_STATE", {
          matchId: null,
          lifecycle: null,
          paymentStatus: null,
          paidUsers: [],
          users: null,
          adminFoodShareId: null,
          restaurantId: null,
          stripeAccountId: null,
          reason: "confirm_unauthenticated",
        });
        throw new functions.https.HttpsError("unauthenticated", "Login required");
      }
      const payload =
        data !== null && typeof data === "object"
          ? (data as Record<string, unknown>)
          : {};
      return await confirmFoodSharePaymentCore({
        payload,
        uid: context.auth.uid,
        stripe: getStripe(),
      });
    } catch (error) {
      logger.error("FOOD_SHARE_CONFIRM_FATAL", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  });
