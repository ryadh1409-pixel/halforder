/**
 * Stripe HTTPS callables (Firebase Functions **1st gen**) — matches existing deployed API version.
 * Webhook is exported from Firebase Functions **v2** (see `stripeWebhook.ts`).
 * Order writes in stripeWebhook use a transaction read-then-write guard — see
 * `webhookOrderWriteGuard.ts` ([STRIPE BLOCKED] when status/deliveryStatus is fulfilled).
 */

import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import Stripe from "stripe";
import {
    finalizeHalfOrderCashRedemption,
    releaseHalfOrderCashRedemption,
    reserveHalfOrderCash,
} from "./cashbackRedemption.js";
import {
    handleFoodSharePaymentCallable,
    isFoodShareConfirmPayload,
    isFoodSharePaymentPayload,
} from "./foodSharePaymentIntentCore.js";
import { buildOrderPaidStatePatch } from "./orderPaidState.js";
import { prepareServerOrderPatch } from "./serverOrderWrite.js";
import {
    createWalletSetupIntentCallable,
    detachWalletPaymentMethodCallable,
    listWalletPaymentMethodsCallable,
} from "./walletPaymentMethods.js";

/** Stripe CAD minimum charge (in cents). */
const STRIPE_MIN_AMOUNT_CENTS = 50;
const DEFAULT_TAX_RATE = 0.13;

function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Same formula as `lib/orderPricing.ts` `computeOrderPricing` — receipt source of truth.
 * Tax applies after promo; waived delivery/service are stored as 0 on the order.
 */
function computeOrderPricingTotalPaid(orderData: Record<string, unknown>): number | null {
  const foodSubtotal = readFiniteNumber(orderData.subtotal);
  if (foodSubtotal == null) return null;

  const deliveryFee = readFiniteNumber(orderData.deliveryFee) ?? 0;
  const serviceFee = readFiniteNumber(orderData.serviceFee) ?? 0;
  const promoDiscount = readFiniteNumber(orderData.promoDiscount) ?? 0;
  const taxRateRaw = readFiniteNumber(orderData.taxRate);
  const taxRate =
    taxRateRaw != null && taxRateRaw >= 0 ? taxRateRaw : DEFAULT_TAX_RATE;

  const taxable = Math.max(
    0,
    roundMoney(foodSubtotal) +
      roundMoney(deliveryFee) +
      roundMoney(serviceFee) -
      roundMoney(promoDiscount),
  );
  const hst = roundMoney(taxable * taxRate);
  return roundMoney(taxable + hst);
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
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required",
      );
    }
    const uid = context.auth.uid;
    try {
      const stripe = getStripe();
      const db = admin.firestore();
      const userRef = db.doc(`users/${uid}`);
      const restaurantRef = db.doc(`restaurants/${uid}`);
      const [userSnap, restaurantSnap] = await Promise.all([
        userRef.get(),
        restaurantRef.get(),
      ]);

      if (!restaurantSnap.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Restaurant profile is not initialized yet.",
        );
      }

      const userData = userSnap.data() ?? {};
      const restaurantData = restaurantSnap.data() ?? {};
      const existing =
        (typeof userData.stripeAccountId === "string" &&
        userData.stripeAccountId.startsWith("acct_")
          ? userData.stripeAccountId
          : null) ||
        (typeof restaurantData.stripeAccountId === "string" &&
        restaurantData.stripeAccountId.startsWith("acct_")
          ? restaurantData.stripeAccountId
          : null);

      let accountId = existing;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          country: "CA",
          capabilities: {
            card_payments: {requested: true},
            transfers: {requested: true},
          },
          business_type: "company",
          metadata: {firebaseUid: uid, role: "restaurant"},
        });
        accountId = account.id;
      }

      await Promise.all([
        userRef.set(
          {
            stripeAccountId: accountId,
            stripeOnboardingComplete: false,
          },
          {merge: true},
        ),
        restaurantRef.set(
          {
            stripeAccountId: accountId,
            stripeConnected: false,
          },
          {merge: true},
        ),
      ]);

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: "https://halforder.app/restaurant-onboarding",
        return_url: "https://halforder.app/restaurant-onboarding",
        type: "account_onboarding",
      });

      return {url: accountLink.url, accountId};
    } catch (error) {
      console.error("[startRestaurantStripeConnect]", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Stripe onboarding failed",
      );
    }
  });

export const checkStripeStatus = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required",
      );
    }
    const uid = context.auth.uid;
    try {
      const stripe = getStripe();
      const db = admin.firestore();
      const userSnap = await db.doc(`users/${uid}`).get();
      const restaurantSnap = await db.doc(`restaurants/${uid}`).get();
      const userData = userSnap.data() ?? {};
      const restaurantData = restaurantSnap.data() ?? {};
      const accountId =
        (typeof userData.stripeAccountId === "string" &&
        userData.stripeAccountId.startsWith("acct_")
          ? userData.stripeAccountId
          : null) ||
        (typeof restaurantData.stripeAccountId === "string" &&
        restaurantData.stripeAccountId.startsWith("acct_")
          ? restaurantData.stripeAccountId
          : null);

      if (!accountId) {
        return {
          hasAccount: false,
          stripeConnected: false,
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
        };
      }

      const account = await stripe.accounts.retrieve(accountId);
      const charges = account.charges_enabled === true;
      const payouts = account.payouts_enabled === true;
      const details = account.details_submitted === true;

      await Promise.all([
        db.doc(`users/${uid}`).set(
          {
            stripeAccountId: accountId,
            stripeChargesEnabled: charges,
            stripeOnboardingComplete: charges,
          },
          {merge: true},
        ),
        db.doc(`restaurants/${uid}`).set(
          {
            stripeAccountId: accountId,
            stripeChargesEnabled: charges,
            stripeDetailsSubmitted: details,
            stripeReady: charges && details,
            stripeConnected: details || charges,
          },
          {merge: true},
        ),
      ]);

      return {
        hasAccount: true,
        stripeConnected: details || charges,
        charges_enabled: charges,
        payouts_enabled: payouts,
        details_submitted: details,
      };
    } catch (error) {
      console.error("[checkStripeStatus]", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not load Stripe status",
      );
    }
  });

export const getRestaurantPayoutBankDetails = functions
  .runWith({secrets: ["STRIPE_SECRET_KEY"]})
  .region("us-central1")
  .https.onCall(async (_data: unknown, context: CallableContext) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login required",
      );
    }
    const uid = context.auth.uid;
    try {
      const stripe = getStripe();
      const db = admin.firestore();
      const [userSnap, restaurantSnap] = await Promise.all([
        db.doc(`users/${uid}`).get(),
        db.doc(`restaurants/${uid}`).get(),
      ]);
      const userData = userSnap.data() ?? {};
      const restaurantData = restaurantSnap.data() ?? {};
      const accountId =
        (typeof userData.stripeAccountId === "string" &&
        userData.stripeAccountId.startsWith("acct_")
          ? userData.stripeAccountId
          : null) ||
        (typeof restaurantData.stripeAccountId === "string" &&
        restaurantData.stripeAccountId.startsWith("acct_")
          ? restaurantData.stripeAccountId
          : null);

      if (!accountId) {
        return {connected: false};
      }

      const account = await stripe.accounts.retrieve(accountId);
      const banks = await stripe.accounts.listExternalAccounts(accountId, {
        object: "bank_account",
        limit: 5,
      });
      const bank = banks.data[0] as Stripe.BankAccount | undefined;
      const restaurantName =
        typeof restaurantData.name === "string" && restaurantData.name.trim()
          ? restaurantData.name.trim()
          : "Restaurant";

      let lastPayoutDate: string | null = null;
      let nextPayoutEstimate: string | null = null;
      try {
        const payouts = await stripe.payouts.list(
          {limit: 1},
          {stripeAccount: accountId},
        );
        const latest = payouts.data[0];
        if (latest?.arrival_date) {
          lastPayoutDate = new Date(latest.arrival_date * 1000).toISOString();
        }
        const schedule = account.settings?.payouts?.schedule;
        if (schedule?.interval) {
          nextPayoutEstimate =
            schedule.interval === "daily"
              ? "Daily"
              : schedule.interval === "weekly"
                ? `Weekly${schedule.weekly_anchor ? ` (${schedule.weekly_anchor})` : ""}`
                : schedule.interval === "monthly"
                  ? "Monthly"
                  : schedule.interval;
        }
      } catch {
        /* payouts list may fail before onboarding completes */
      }

      const status =
        account.charges_enabled && account.payouts_enabled
          ? "Active"
          : account.details_submitted
            ? "Pending review"
            : "Setup incomplete";

      return {
        connected: true,
        accountId,
        bankName: bank?.bank_name ?? "Connected bank",
        accountHolderName:
          bank?.account_holder_name?.trim() || restaurantName,
        last4: bank?.last4 ?? null,
        routingLast4: bank?.routing_number
          ? String(bank.routing_number).slice(-4)
          : null,
        currency: (bank?.currency || account.default_currency || "cad").toUpperCase(),
        country: bank?.country || account.country || "CA",
        accountStatus: status,
        chargesEnabled: account.charges_enabled === true,
        payoutsEnabled: account.payouts_enabled === true,
        detailsSubmitted: account.details_submitted === true,
        lastPayoutDate,
        nextPayoutEstimate,
      };
    } catch (error) {
      console.error("[getRestaurantPayoutBankDetails]", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        error instanceof Error ? error.message : "Could not load bank details",
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
    let orderData = orderSnap.data() ?? {};
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

    const useHalfOrderCash = payload.useHalfOrderCash === true;
    const cashbackReservation = useHalfOrderCash
      ? await reserveHalfOrderCash({uid, orderId})
      : null;
    if (cashbackReservation?.appliedCents) {
      orderData = {
        ...orderData,
        halfOrderCashAppliedCents: cashbackReservation.appliedCents,
        halfOrderCashAppliedCad: cashbackReservation.appliedCents / 100,
        halfOrderCashRedemptionStatus: "reserved",
        originalCustomerTotalCents:
          cashbackReservation.originalCustomerTotalCents,
        customerTotal: cashbackReservation.remainingCents / 100,
        total: cashbackReservation.remainingCents / 100,
        totalPrice: cashbackReservation.remainingCents / 100,
      };
    }
    let releaseNewReservationOnError =
      cashbackReservation?.newlyReserved === true;
    const cashbackRedemptionId = cashbackReservation?.appliedCents
      ? `use_${orderId}`
      : "";

    try {
      // Canonical payable amount = client checkoutChargeCents / checkoutFinalTotalCents.
      // Never charge order.totalPrice (may be a stale pre-promo reuse, e.g. $2.26 vs $1.13).
      const orderAmountCents = Math.round(
        (readFiniteNumber(orderData.customerTotal) ??
          readFiniteNumber(orderData.total) ??
          readFiniteNumber(orderData.totalPrice) ??
          0) * 100,
      );
      const amountCents =
        amount > 0
          ? amount
          : orderAmountCents;

      if (
        amount > 0 &&
        orderAmountCents > 0 &&
        Math.abs(amount - orderAmountCents) > 1
      ) {
        const checkoutCad = amount / 100;
        console.warn(
          JSON.stringify({
            msg: "createPaymentIntent_amount_mismatch_using_checkout",
            orderId,
            checkoutAmountCents: amount,
            orderAmountCents,
            amountSentToStripe: amount,
          }),
        );
        // Align stored charge fields to Checkout so retries do not re-read stale totals.
        await orderSnap.ref.set(
          {
            customerTotal: checkoutCad,
            total: checkoutCad,
            totalPrice: checkoutCad,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        orderData = {
          ...orderData,
          customerTotal: checkoutCad,
          total: checkoutCad,
          totalPrice: checkoutCad,
        };
      }

      // $0.00 totals: skip Stripe entirely and mark the order paid.
      if (amountCents === 0) {
        releaseNewReservationOnError = false;
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
        await finalizeHalfOrderCashRedemption(orderId);
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
          receiptTotalPaid: computeOrderPricingTotalPaid(orderData),
          orderTotalPrice: orderData.totalPrice ?? orderData.total ?? null,
          orderPromoDiscount: orderData.promoDiscount ?? null,
          orderDeliveryFee: orderData.deliveryFee ?? null,
          orderServiceFee: orderData.serviceFee ?? null,
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

      // Reuse existing PaymentIntent only when its amount matches the receipt total.
      // If the amount is stale (e.g. pre-discount $5.94), cancel and create a new PI.
      const priorPiRaw =
        orderData.stripePaymentIntentId ?? orderData.paymentIntentId;
      const priorPiId =
        typeof priorPiRaw === "string" && priorPiRaw.startsWith("pi_")
          ? priorPiRaw.trim()
          : "";

      let reusedPaymentIntent: Stripe.PaymentIntent | null = null;
      if (priorPiId) {
        try {
          const prior = await stripe.paymentIntents.retrieve(priorPiId);
          const reusable =
            prior.status === "requires_payment_method" ||
            prior.status === "requires_confirmation" ||
            prior.status === "requires_action";
          if (reusable && prior.amount === chargeAmountCents && prior.client_secret) {
            reusedPaymentIntent =
              cashbackRedemptionId &&
              prior.metadata.halfOrderCashRedemptionId !== cashbackRedemptionId
                ? await stripe.paymentIntents.update(prior.id, {
                    metadata: {
                      halfOrderCashRedemptionId: cashbackRedemptionId,
                    },
                  })
                : prior;
            console.log(
              JSON.stringify({
                msg: "createPaymentIntent_reused_matching_pi",
                orderId,
                paymentIntentId: prior.id,
                amount: prior.amount,
              }),
            );
          } else if (reusable && prior.amount !== chargeAmountCents) {
            await stripe.paymentIntents.cancel(priorPiId);
            console.log(
              JSON.stringify({
                msg: "createPaymentIntent_canceled_stale_pi",
                orderId,
                priorPiId,
                priorAmount: prior.amount,
                chargeAmountCents,
              }),
            );
          }
        } catch (priorErr) {
          console.warn(
            "[createPaymentIntent] prior PaymentIntent retrieve/cancel skipped:",
            priorErr,
          );
        }
      }

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
            ...(cashbackRedemptionId
              ? {halfOrderCashRedemptionId: cashbackRedemptionId}
              : {}),
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
              ...(cashbackRedemptionId
                ? {halfOrderCashRedemptionId: cashbackRedemptionId}
                : {}),
            },
          },
        });
        releaseNewReservationOnError = false;

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

      const paymentIntent =
        reusedPaymentIntent ??
        (await stripe.paymentIntents.create({
          amount: chargeAmountCents,
          currency: "cad",
          customer: customerId,
          // Card + Apple Pay / Link via PaymentSheet only — no Klarna / BNPL.
          payment_method_types: ["card"],
          metadata: {
            orderId,
            userId: uid,
            restaurantId,
            driverId: driverIdRaw,
            uid,
            treasury: "halforder_platform",
            restaurantStripeAccountId: restaurantStripeAccountId ?? "",
            ...(cashbackRedemptionId
              ? {halfOrderCashRedemptionId: cashbackRedemptionId}
              : {}),
          },
        }));
      releaseNewReservationOnError = false;
      if (!reusedPaymentIntent) {
        console.log(
          JSON.stringify({
            msg: "createPaymentIntent_created_new_pi",
            orderId,
            paymentIntentId: paymentIntent.id,
            chargeAmountCents,
          }),
        );
      }
      const ephemeralKey = await stripe.ephemeralKeys.create(
        {customer: customerId},
        {apiVersion: "2025-02-24.acacia"},
      );
      // Persist intent id so a later retry can cancel this PI if the receipt total changes.
      await orderSnap.ref.set(
        {
          paymentIntentId: paymentIntent.id,
          stripePaymentIntentId: paymentIntent.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
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
          reused: Boolean(reusedPaymentIntent),
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
        // Echo so the client can log amountSentToStripe vs PaymentIntent amount.
        chargeAmountCents,
      };
    } catch (err) {
      if (releaseNewReservationOnError) {
        try {
          await releaseHalfOrderCashRedemption(
            orderId,
            "stripe_payment_artifact_creation_failed",
          );
        } catch (releaseErr) {
          console.error(
            "[createPaymentIntent] HalfOrder Cash release failed:",
            releaseErr,
          );
        }
      }
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

export {
    cancelCompleteMealCampaign, confirmCompleteMealPayment, createCompleteMealCampaign, createCompleteMealPaymentIntent, getCompleteMealCampaign
} from "./completeMealCallables.js";
export { createFoodSharePaymentIntent } from "./createFoodSharePaymentIntent.js";
export { stripeWebhook } from "./stripeWebhook.js";

export { getAdminStripePayouts } from "./adminStripePayouts.js";
export {
    getStripeAccountDiagnostics, getStripeTreasurySummary
} from "./adminStripeTreasury.js";
export { cancelFoodShareMatch } from "./cancelFoodShareMatch.js";
export { confirmFoodSharePayment } from "./confirmFoodSharePayment.js";
export { confirmFoodSharePickup } from "./confirmFoodSharePickup.js";
export {
    claimEmoHiEmoooReward,
    redeemEmoHiEmoooDiscount
} from "./emoAiHiEmoooReward.js";
export { ensureFoodShareDispatchOrder } from "./ensureFoodShareDispatchOrder.js";
export {
    syncFoodShareMatchLifecycleFromOrder,
    syncFoodShareMatchLifecycleFromOrderUpdated
} from "./foodShareOrderLifecycleMirror.js";
export {
    notifyFoodSharePaymentStatusPaid
} from "./foodSharePaymentNotifications.js";
export {
    emoAiChat, generateFoodCardDescription, generateMatchSuggestion
} from "./openAiCallables.js";
export { refundFoodShareMatch } from "./refundFoodShareMatch.js";
export {
    acceptCommunityGuidelines, sendModeratedMatchChatMessage
} from "./sendModeratedMatchChatMessage.js";
export { sendDailyMetricsReport } from "./dailyMetricsReport.js";

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
