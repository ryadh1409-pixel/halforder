import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {
  cancelCompleteMealCampaignCore,
  confirmCompleteMealPaymentCore,
  createCompleteMealCampaignCore,
  createCompleteMealPaymentIntentCore,
  getCompleteMealCampaignCore,
} from "./completeMealCore.js";

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

export const createCompleteMealCampaign = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    return createCompleteMealCampaignCore(data, context);
  });

export const getCompleteMealCampaign = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    return getCompleteMealCampaignCore(data, context);
  });

export const cancelCompleteMealCampaign = functions
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    return cancelCompleteMealCampaignCore(data, context);
  });

export const createCompleteMealPaymentIntent = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    return createCompleteMealPaymentIntentCore({
      data,
      context,
      stripe: getStripe(),
    });
  });

export const confirmCompleteMealPayment = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    return confirmCompleteMealPaymentCore({
      data,
      context,
      stripe: getStripe(),
    });
  });
