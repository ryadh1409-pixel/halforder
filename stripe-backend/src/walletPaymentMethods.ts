/**
 * Wallet payment methods — SetupIntent + list/detach (Stripe Customer).
 * Does not modify order/checkout PaymentIntent flows.
 */
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import Stripe from "stripe";

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
    metadata: {uid, purpose: "wallet"},
    ...(email ? {email} : {}),
  });
  await userRef.set({stripeCustomerId: customer.id}, {merge: true});
  return customer.id;
}

function assertAuthed(context: CallableContext): {
  uid: string;
  email: string | null;
} {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const provider =
    (context.auth.token as {firebase?: {sign_in_provider?: string}} | undefined)
      ?.firebase?.sign_in_provider ?? "unknown";
  if (provider === "anonymous") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Sign in with a full account to manage payment methods.",
    );
  }
  const email =
    typeof context.auth.token.email === "string"
      ? context.auth.token.email
      : null;
  return {uid: context.auth.uid, email};
}

function mapCardPaymentMethod(pm: Stripe.PaymentMethod) {
  const card = pm.card;
  return {
    id: pm.id,
    brand: card?.brand ?? "card",
    last4: card?.last4 ?? "••••",
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
    type: pm.type,
  };
}

export function createWalletSetupIntentCallable(getStripe: () => Stripe) {
  return async (_data: unknown, context: CallableContext) => {
    const {uid, email} = assertAuthed(context);
    const stripe = getStripe();
    try {
      const customerId = await getOrCreateStripeCustomer(stripe, uid, email);
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {uid, purpose: "wallet_save_card"},
      });
      if (!setupIntent.client_secret) {
        throw new Error("Missing SetupIntent client secret");
      }
      return {
        customerId,
        setupIntentId: setupIntent.id,
        clientSecret: setupIntent.client_secret,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create SetupIntent.";
      console.error("[walletCreateSetupIntent]", message, err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", message);
    }
  };
}

export function listWalletPaymentMethodsCallable(getStripe: () => Stripe) {
  return async (_data: unknown, context: CallableContext) => {
    const {uid, email} = assertAuthed(context);
    const stripe = getStripe();
    try {
      const customerId = await getOrCreateStripeCustomer(stripe, uid, email);
      const listed = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 20,
      });
      const paymentMethods = listed.data.map(mapCardPaymentMethod);

      // Safe display refs only — never PAN/CVV.
      await admin.firestore().doc(`users/${uid}`).set(
        {
          stripeCustomerId: customerId,
          walletPaymentMethods: paymentMethods.map((pm) => ({
            paymentMethodId: pm.id,
            brand: pm.brand,
            last4: pm.last4,
            expMonth: pm.expMonth,
            expYear: pm.expYear,
          })),
          walletPaymentMethodsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      return {customerId, paymentMethods};
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to list payment methods.";
      console.error("[walletListPaymentMethods]", message, err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", message);
    }
  };
}

export function detachWalletPaymentMethodCallable(getStripe: () => Stripe) {
  return async (data: unknown, context: CallableContext) => {
    const {uid} = assertAuthed(context);
    const payload =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)
        : {};
    const paymentMethodId =
      typeof payload.paymentMethodId === "string"
        ? payload.paymentMethodId.trim()
        : "";
    if (!paymentMethodId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "paymentMethodId is required.",
      );
    }

    const stripe = getStripe();
    try {
      const customerId = await getOrCreateStripeCustomer(stripe, uid, null);
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const pmCustomer =
        typeof pm.customer === "string"
          ? pm.customer
          : pm.customer && typeof pm.customer === "object"
            ? pm.customer.id
            : "";
      if (pmCustomer !== customerId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "This payment method does not belong to your wallet.",
        );
      }
      await stripe.paymentMethods.detach(paymentMethodId);
      return {ok: true, paymentMethodId};
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      const message =
        err instanceof Error ? err.message : "Failed to remove payment method.";
      console.error("[walletDetachPaymentMethod]", message, err);
      throw new functions.https.HttpsError("internal", message);
    }
  };
}
