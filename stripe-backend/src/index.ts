/**
 * Stripe HTTPS callables (Firebase Functions **1st gen**) — matches existing deployed API version.
 * Webhook is exported from Firebase Functions **v2** (see `stripeWebhook.ts`).
 * Order writes in stripeWebhook use a transaction read-then-write guard — see
 * `webhookOrderWriteGuard.ts` ([STRIPE BLOCKED] when status/deliveryStatus is fulfilled).
 */

import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import {defineSecret} from "firebase-functions/params";
import Stripe from "stripe";
import {
  handleFoodSharePaymentCallable,
  isFoodShareConfirmPayload,
  isFoodSharePaymentPayload,
} from "./foodSharePaymentIntentCore.js";
import {buildOrderPaidStatePatch} from "./orderPaidState.js";
import {prepareServerOrderPatch} from "./serverOrderWrite.js";
import {
  createWalletSetupIntentCallable,
  detachWalletPaymentMethodCallable,
  listWalletPaymentMethodsCallable,
} from "./walletPaymentMethods.js";

/** Stripe CAD minimum charge (in cents). */
const STRIPE_MIN_AMOUNT_CENTS = 50;

/**
 * Final amount the customer owes after promos — prefer `customerTotal`, then
 * reconstruct from receipt fields, then `totalPrice` / `total`. Returns cents.
 */
function orderCustomerChargeCents(orderData: Record<string, unknown>): number | null {
  const customerTotal = orderData.customerTotal;
  if (typeof customerTotal === "number" && Number.isFinite(customerTotal)) {
    return Math.round(customerTotal * 100);
  }

  const subtotal =
    typeof orderData.subtotal === "number" && Number.isFinite(orderData.subtotal)
      ? orderData.subtotal
      : null;
  const promoDiscount =
    typeof orderData.promoDiscount === "number" && Number.isFinite(orderData.promoDiscount)
      ? orderData.promoDiscount
      : 0;
  const tax =
    typeof orderData.tax === "number" && Number.isFinite(orderData.tax)
      ? orderData.tax
      : null;
  const deliveryFee =
    typeof orderData.deliveryFee === "number" && Number.isFinite(orderData.deliveryFee)
      ? orderData.deliveryFee
      : 0;
  const serviceFee =
    typeof orderData.serviceFee === "number" && Number.isFinite(orderData.serviceFee)
      ? orderData.serviceFee
      : 0;

  // Prefer receipt math over totalPrice when promo fields exist (avoids stale pre-discount totals).
  if (subtotal != null && tax != null) {
    const dollars =
      Math.max(0, subtotal - promoDiscount) + deliveryFee + serviceFee + tax;
    return Math.round(dollars * 100);
  }

  const totalPrice = orderData.totalPrice ?? orderData.total;
  if (typeof totalPrice === "number" && Number.isFinite(totalPrice)) {
    return Math.round(totalPrice * 100);
  }
  return null;
}

if (!admin.apps.length) {
  admin.initializeApp();
}

let stripeSingleton: Stripe | null = null;
const stripeSecret = defineSecret("STRIPE_SECRET_KEY");
function getStripe(): Stripe {
  const stripeSecretKey = stripeSecret.value();
  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return stripeSingleton;
}

/** Same Customer as Wallet / Swipe — admin Stripe account only (no Connect). */
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  uid: string,
  email?: string | null,
): Promise<string> {
  const userRef = admin.firestore().doc(`users/${uid}`);
  const snap = await userRef.get();
  const data = snap.data() ?? {};
  const existing =
    typeof data.stripeCustomerId === "string" ? data.stripeCustomerId.trim() : "";
  if (existing) return existing;

  const customer = await stripe.customers.create({
    metadata: {uid, purpose: "checkout"},
    ...(email ? {email} : {}),
  });
  await userRef.set({stripeCustomerId: customer.id}, {merge: true});
  return customer.id;
}

export const startRestaurantStripeConnect = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, _context: CallableContext) => {
    try {
      const stripe = getStripe();
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
      throw new functions.https.HttpsError(
        "internal",
        "Stripe onboarding failed",
      );
    }
  });

export const createPaymentIntent = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (data: unknown, context: CallableContext) => {
    // App Check: not enforced in this handler (Console enforcement is separate).
    // Gen1 callable uses `context` (same auth as v2 `request.auth`).
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required",
      );
    }
    // Anonymous Firebase users have `context.auth` + `uid` — allowed for MVP checkout.
    const uid = context.auth.uid;
    const provider =
      (
        context.auth.token as
          | {firebase?: {sign_in_provider?: string}}
          | undefined
      )?.firebase?.sign_in_provider ?? "unknown";
    console.log("[createPaymentIntent] caller uid=", uid, "provider=", provider);

    const payload =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};

    if (isFoodShareConfirmPayload(payload) || isFoodSharePaymentPayload(payload)) {
      return handleFoodSharePaymentCallable(data, context, getStripe());
    }

    const amountRaw = payload.amount;
    const amount =
      typeof amountRaw === "number" ? amountRaw : Number(amountRaw);

    if (!Number.isInteger(amount) || amount < 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "amount must be a non-negative integer in cents.",
      );
    }

    const orderIdRaw = payload.orderId;
    const orderId =
      typeof orderIdRaw === "string" && orderIdRaw.trim()
        ? orderIdRaw.trim()
        : null;
    if (!orderId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "orderId is required.",
      );
    }

    const platformRaw = payload.platform;
    const platform = platformRaw === "web" ? "web" : "native";

    const secretLoaded = Boolean(process.env.STRIPE_SECRET_KEY);
    console.log("[createPaymentIntent] stripe secret loaded:", secretLoaded);
    if (!secretLoaded) {
      throw new functions.https.HttpsError(
        "internal",
        "Missing STRIPE_SECRET_KEY in function environment.",
      );
    }

    const orderSnap = await admin.firestore().doc(`orders/${orderId}`).get();
    if (!orderSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Order not found.",
      );
    }
    const orderData = orderSnap.data() ?? {};
    const restaurantId =
      typeof orderData.restaurantId === "string" && orderData.restaurantId.trim()
        ? orderData.restaurantId.trim()
        : "";
    if (!restaurantId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Order is missing restaurantId.",
      );
    }

    const restaurantSnap = await admin
      .firestore()
      .doc(`restaurants/${restaurantId}`)
      .get();
    if (!restaurantSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Restaurant not found.",
      );
    }
    const restaurantData = restaurantSnap.data() ?? {};
    const restaurantStripeAccountId =
      typeof restaurantData.stripeAccountId === "string" &&
      restaurantData.stripeAccountId.trim()
        ? restaurantData.stripeAccountId.trim()
        : null;

    const orderUserId =
      typeof orderData.userId === "string" && orderData.userId.trim()
        ? orderData.userId.trim()
        : typeof orderData.customerId === "string" && orderData.customerId.trim()
          ? orderData.customerId.trim()
          : "";
    if (!orderUserId || orderUserId !== uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You can only pay for your own orders.",
      );
    }

    const driverIdRaw =
      typeof orderData.driverId === "string" && orderData.driverId.trim()
        ? orderData.driverId.trim()
        : typeof orderData.assignedDriverId === "string" && orderData.assignedDriverId.trim()
          ? orderData.assignedDriverId.trim()
          : "";

    const resolveAppBaseUrl = (): string => {
      const fromEnv =
        (typeof process.env.EXPO_PUBLIC_APP_URL === "string"
          ? process.env.EXPO_PUBLIC_APP_URL.trim()
          : "") ||
        (typeof process.env.APP_URL === "string" ? process.env.APP_URL.trim() : "") ||
        (typeof process.env.APP_BASE_URL === "string"
          ? process.env.APP_BASE_URL.trim()
          : "");
      if (fromEnv) return fromEnv.replace(/\/$/, "");
      return "https://halforder.app";
    };

    try {
      // Charge from order.customerTotal (post-promo), never a stale client amount.
      const orderAmountCents = orderCustomerChargeCents(orderData);
      const amountCents =
        orderAmountCents != null && orderAmountCents >= 0
          ? orderAmountCents
          : amount;

      // $0.00 totals: skip Stripe entirely and mark the order paid.
      if (amountCents === 0) {
        const freePaymentId = `free_${orderId}`;
        const basePatch = buildOrderPaidStatePatch(orderData, {
          paymentIntentId: freePaymentId,
        });
        const patch: Record<string, unknown> = {
          ...basePatch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const safe = prepareServerOrderPatch(
          orderId,
          orderData,
          patch,
          "createPaymentIntent:zeroAmount",
        );
        if (Object.keys(safe).length > 0) {
          await orderSnap.ref.set(safe, {merge: true});
        }
        console.log(
          JSON.stringify({
            msg: "createPaymentIntent_zero_amount_marked_paid",
            orderId,
            userId: uid,
            restaurantId,
          }),
        );
        return {
          zeroAmountPaid: true,
          paymentIntentId: freePaymentId,
          clientSecret: null,
          customerId: null,
          ephemeralKey: null,
        };
      }

      const chargeAmountCents = Math.max(amountCents, STRIPE_MIN_AMOUNT_CENTS);
      console.log(
        JSON.stringify({
          msg: "createPaymentIntent_amount_resolved",
          orderId,
          clientAmountCents: amount,
          orderCustomerTotal: orderData.customerTotal ?? null,
          orderTotalPrice: orderData.totalPrice ?? orderData.total ?? null,
          amountCents,
          chargeAmountCents,
        }),
      );

      const stripe = getStripe();
      const email =
        typeof context.auth.token.email === "string"
          ? context.auth.token.email
          : null;
      // Admin platform Customer only — no Connect destination / transfer_data.
      const customerId = await getOrCreateStripeCustomer(stripe, uid, email);

      if (platform === "web") {
        const webChargeCents = chargeAmountCents;
        const restaurantName =
          typeof restaurantData.name === "string" && restaurantData.name.trim()
            ? restaurantData.name.trim()
            : typeof restaurantData.restaurantName === "string" &&
                restaurantData.restaurantName.trim()
              ? restaurantData.restaurantName.trim()
              : "OurFood Order";
        const appUrl = resolveAppBaseUrl();
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId,
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "cad",
                product_data: {
                  name: restaurantName,
                },
                unit_amount: webChargeCents,
              },
              quantity: 1,
            },
          ],
          success_url: `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&orderId=${encodeURIComponent(orderId)}`,
          cancel_url: `${appUrl}/checkout-cancelled?orderId=${encodeURIComponent(orderId)}`,
          metadata: {
            orderId,
            userId: uid,
            restaurantId,
            driverId: driverIdRaw,
            uid,
            treasury: "halforder_platform",
            restaurantStripeAccountId: restaurantStripeAccountId ?? "",
          },
          payment_intent_data: {
            metadata: {
              orderId,
              userId: uid,
              restaurantId,
              driverId: driverIdRaw,
              uid,
              treasury: "halforder_platform",
              restaurantStripeAccountId: restaurantStripeAccountId ?? "",
            },
          },
        });

        console.log(
          JSON.stringify({
            msg: "createCheckoutSession_success",
            checkoutSessionId: session.id,
            orderId,
            userId: uid,
            restaurantId,
            customerId,
          }),
        );

        const checkoutUrl =
          typeof session.url === "string" ? session.url.trim() : "";
        if (!checkoutUrl) {
          throw new functions.https.HttpsError(
            "internal",
            "Stripe Checkout session URL missing",
          );
        }

        return {
          checkoutSessionId: session.id,
          checkoutUrl,
          customerId,
        };
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: chargeAmountCents,
        currency: "cad",
        customer: customerId,
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          orderId,
          userId: uid,
          restaurantId,
          driverId: driverIdRaw,
          uid,
          treasury: "halforder_platform",
          restaurantStripeAccountId: restaurantStripeAccountId ?? "",
        },
      });
      const ephemeralKey = await stripe.ephemeralKeys.create(
        {customer: customerId},
        {apiVersion: "2025-02-24.acacia"},
      );
      console.log(
        JSON.stringify({
          msg: "createPaymentIntent_success",
          paymentIntentId: paymentIntent.id,
          orderId,
          userId: uid,
          restaurantId,
          driverId: driverIdRaw || null,
          customerId,
          chargeAmountCents,
          treasury: "halforder_platform",
        }),
      );
      const clientSecret = paymentIntent.client_secret;
      if (!clientSecret) {
        throw new Error("Missing payment intent client secret");
      }
      return {
        clientSecret,
        paymentIntentId: paymentIntent.id,
        customerId,
        ephemeralKey: ephemeralKey.secret ?? null,
      };
    } catch (err) {
      const stripeErr = err as {
        message?: string;
        type?: string;
        code?: string;
        decline_code?: string;
        param?: string;
        detail?: string;
        rawType?: string;
        statusCode?: number;
        requestId?: string;
        doc_url?: string;
        headers?: unknown;
        raw?: unknown;
        payment_intent?: unknown;
        charge?: unknown;
      };
      // Full Stripe failure details for debugging (do not change create logic).
      console.error(
        "[createPaymentIntent] Stripe error full response:",
        JSON.stringify(
          {
            message: stripeErr.message ?? null,
            type: stripeErr.type ?? null,
            code: stripeErr.code ?? null,
            decline_code: stripeErr.decline_code ?? null,
            param: stripeErr.param ?? null,
            detail: stripeErr.detail ?? null,
            rawType: stripeErr.rawType ?? null,
            statusCode: stripeErr.statusCode ?? null,
            requestId: stripeErr.requestId ?? null,
            doc_url: stripeErr.doc_url ?? null,
            headers: stripeErr.headers ?? null,
            raw: stripeErr.raw ?? null,
            payment_intent: stripeErr.payment_intent ?? null,
            charge: stripeErr.charge ?? null,
            errorKeys:
              err && typeof err === "object"
                ? Object.keys(err as object)
                : [],
          },
          null,
          2,
        ),
      );
      console.error("[createPaymentIntent] Stripe error object:", err);
      throw new functions.https.HttpsError(
        "internal",
        stripeErr.message || "Failed to create payment intent.",
      );
    }
  });

export { stripeWebhook } from "./stripeWebhook.js";
export { createFoodSharePaymentIntent } from "./createFoodSharePaymentIntent.js";
export { ensureFoodShareDispatchOrder } from "./ensureFoodShareDispatchOrder.js";
export { confirmFoodSharePayment } from "./confirmFoodSharePayment.js";
export { refundFoodShareMatch } from "./refundFoodShareMatch.js";
export { cancelFoodShareMatch } from "./cancelFoodShareMatch.js";
export {
  syncFoodShareMatchLifecycleFromOrder,
  syncFoodShareMatchLifecycleFromOrderUpdated,
} from "./foodShareOrderLifecycleMirror.js";
export {
  notifyFoodSharePaymentStatusPaid,
} from "./foodSharePaymentNotifications.js";
export {
  sendModeratedMatchChatMessage,
  acceptCommunityGuidelines,
} from "./sendModeratedMatchChatMessage.js";
export {
  emoAiChat,
  generateMatchSuggestion,
  generateFoodCardDescription,
} from "./openAiCallables.js";
export {
  claimEmoHiEmoooReward,
  redeemEmoHiEmoooDiscount,
} from "./emoAiHiEmoooReward.js";
export {getAdminStripePayouts} from "./adminStripePayouts.js";
export {
  getStripeTreasurySummary,
  getStripeAccountDiagnostics,
} from "./adminStripeTreasury.js";

export const walletCreateSetupIntent = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(createWalletSetupIntentCallable(getStripe));

export const walletListPaymentMethods = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(listWalletPaymentMethodsCallable(getStripe));

export const walletDetachPaymentMethod = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(detachWalletPaymentMethodCallable(getStripe));
