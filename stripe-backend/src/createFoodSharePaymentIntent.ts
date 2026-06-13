import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type {CallableContext} from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {
  foodSharePaymentDocId,
  quoteFoodSharePayment,
} from "./foodSharePaymentLogic.js";

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

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  uid: string,
  email?: string | null,
): Promise<string> {
  const db = admin.firestore();
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  const data = snap.data() ?? {};
  const existing =
    typeof data.stripeCustomerId === "string" ? data.stripeCustomerId.trim() : "";
  if (existing) return existing;

  const customer = await stripe.customers.create({
    metadata: {uid},
    ...(email ? {email} : {}),
  });
  await userRef.set({stripeCustomerId: customer.id}, {merge: true});
  return customer.id;
}

/**
 * Creates a PaymentIntent for a food-share match participant.
 * Amount is computed server-side from `adminFoodShares` — never from client.
 */
export const createFoodSharePaymentIntent = functions
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
    const matchId =
      typeof payload.matchId === "string" ? payload.matchId.trim() : "";
    if (!matchId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "matchId is required.",
      );
    }

    const platformRaw = payload.platform;
    const platform = platformRaw === "web" ? "web" : "native";

    const db = admin.firestore();
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    if (!matchSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Match not found.");
    }
    const match = matchSnap.data() ?? {};
    const users = Array.isArray(match.users)
      ? match.users.filter((x): x is string => typeof x === "string")
      : [];
    if (!users.includes(uid)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not part of this match.",
      );
    }

    const lifecycle = String(match.lifecycle ?? "");
    if (
      lifecycle !== "WAITING_FOR_PAYMENT" &&
      lifecycle !== "PAYMENT_CONFIRMED"
    ) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This match is not awaiting payment.",
      );
    }

    const adminFoodShareId =
      typeof match.adminFoodShareId === "string"
        ? match.adminFoodShareId
        : typeof match.foodShareId === "string"
          ? match.foodShareId
          : "";
    if (!adminFoodShareId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Match missing food share reference.",
      );
    }

    const shareSnap = await db.doc(`adminFoodShares/${adminFoodShareId}`).get();
    if (!shareSnap.exists || shareSnap.data()?.active !== true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Food share is not active.",
      );
    }
    const share = shareSnap.data() ?? {};
    const sharedPrice =
      typeof share.sharedPrice === "number" ? share.sharedPrice : 0;
    const deliveryShare =
      typeof share.deliveryShare === "number" ? share.deliveryShare : 0;
    const quote = quoteFoodSharePayment({sharedPrice, deliveryShare});

    const paymentId = foodSharePaymentDocId(matchId, uid);
    const paymentRef = db.doc(`payments/${paymentId}`);
    const existingPayment = await paymentRef.get();
    if (existingPayment.exists) {
      const ps = existingPayment.data()?.paymentStatus;
      if (ps === "PAID") {
        throw new functions.https.HttpsError(
          "already-exists",
          "Payment already completed.",
        );
      }
    }

    const stripe = getStripe();
    const email = context.auth.token.email ?? null;
    const customerId = await getOrCreateStripeCustomer(stripe, uid, email);

    const foodName =
      typeof match.foodName === "string" ? match.foodName : "Meal share";

    if (platform === "web") {
      const appUrl =
        process.env.APP_BASE_URL?.trim() || "https://halforder.app";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {name: `${foodName} — meal share`},
              unit_amount: quote.totalCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/food-share-pay/${encodeURIComponent(matchId)}?paid=1`,
        cancel_url: `${appUrl}/food-share-pay/${encodeURIComponent(matchId)}?canceled=1`,
        metadata: {
          type: "food_share",
          matchId,
          userId: uid,
          adminFoodShareId,
        },
        payment_intent_data: {
          metadata: {
            type: "food_share",
            matchId,
            userId: uid,
            adminFoodShareId,
          },
        },
      });
      await paymentRef.set(
        {
          type: "food_share",
          matchId,
          userId: uid,
          adminFoodShareId,
          amount: quote.totalCents,
          currency: "usd",
          foodShareCostCents: quote.foodShareCents,
          deliveryShareCostCents: quote.deliveryShareCents,
          platformFeeCents: quote.platformFeeCents,
          paymentStatus: "PENDING",
          stripeCheckoutSessionId: session.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt:
            existingPayment.exists
              ? existingPayment.data()?.createdAt
              : admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      return {
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        amountCents: quote.totalCents,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: quote.totalCents,
      currency: "usd",
      customer: customerId,
      automatic_payment_methods: {enabled: true},
      metadata: {
        type: "food_share",
        matchId,
        userId: uid,
        adminFoodShareId,
      },
    });

    await paymentRef.set(
      {
        type: "food_share",
        matchId,
        userId: uid,
        adminFoodShareId,
        amount: quote.totalCents,
        currency: "usd",
        foodShareCostCents: quote.foodShareCents,
        deliveryShareCostCents: quote.deliveryShareCents,
        platformFeeCents: quote.platformFeeCents,
        paymentStatus: "PENDING",
        stripePaymentIntentId: paymentIntent.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt:
          existingPayment.exists
            ? existingPayment.data()?.createdAt
            : admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    const ephemeralKey = await stripe.ephemeralKeys.create(
      {customer: customerId},
      {apiVersion: "2025-02-24.acacia"},
    );

    if (!paymentIntent.client_secret) {
      throw new functions.https.HttpsError(
        "internal",
        "Missing payment intent client secret.",
      );
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      customerId,
      ephemeralKey: ephemeralKey.secret,
      amountCents: quote.totalCents,
    };
  });
