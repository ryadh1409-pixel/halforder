/**
 * Stripe Connect HTTPS endpoints (firebase-functions v2).
 */

import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions";
import {onCall} from "firebase-functions/v2/https";
import Stripe from "stripe";

if (!admin.apps.length) {
  admin.initializeApp();
}

setGlobalOptions({maxInstances: 10});

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-02-24.acacia",
});

export const startRestaurantStripeConnect = onCall(
  {region: "us-central1"},
  async (_request) => {
    try {
      const account = await stripe.accounts.create({
        type: "express",
      });

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: "https://example.com/refresh",
        return_url: "https://example.com/return",
        type: "account_onboarding",
      });

      return {url: accountLink.url};
    } catch (error) {
      console.error(error);
      throw new Error("Stripe onboarding failed");
    }
  },
);
