import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import Stripe from "stripe";
import { confirmFoodSharePaymentCore } from "./confirmFoodSharePaymentCore.js";
import {
  foodSharePaymentDocId,
  quoteFoodSharePayment,
} from "./foodSharePaymentLogic.js";

function paymentDebugState(input: {
  matchId: string | null;
  match?: Record<string, unknown> | null;
  share?: Record<string, unknown> | null;
  paymentStatus?: unknown;
  reason: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const {matchId, match, share, paymentStatus, reason, extra} = input;
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
    paidUsers: users.filter((u) =>
      String(payments[u]?.paymentStatus ?? "").trim().toUpperCase() === "PAID",
    ),
    users,
    adminFoodShareId,
    restaurantId:
      typeof match?.restaurantId === "string" ? match.restaurantId : adminFoodShareId,
    stripeAccountId:
      typeof share?.stripeAccountId === "string" ?
        share.stripeAccountId :
        typeof match?.stripeAccountId === "string" ?
          match.stripeAccountId :
          null,
    stripePayoutsEnabled: share?.stripePayoutsEnabled ?? null,
    reason,
    ...(extra ?? {}),
  };
}

export type FoodSharePaymentIntentResult =
  | {
      kind: "native";
      clientSecret: string;
      paymentIntentId: string;
      customerId: string;
      ephemeralKey: string | null;
      amountCents: number;
    }
  | {
      kind: "web";
      checkoutSessionId: string;
      checkoutUrl: string;
      amountCents: number;
    };

async function readDocOrLogMissing(
  db: admin.firestore.Firestore,
  path: string,
): Promise<admin.firestore.DocumentSnapshot> {
  console.log("[PAYMENT READ]", path);
  const snap = await db.doc(path).get();
  console.log("[PAYMENT DOC EXISTS]", path, snap.exists);
  if (!snap.exists) {
    console.error("[PAYMENT MISSING DOC]", path, {
      exists: false,
      data: null,
    });
  }
  return snap;
}

async function getOrCreateStripeCustomer(
  stripe: Stripe,
  uid: string,
  email?: string | null,
): Promise<string> {
  const db = admin.firestore();
  const userPath = `users/${uid}`;
  const userRef = db.doc(userPath);
  const snap = await readDocOrLogMissing(db, userPath);
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

export async function runCreateFoodSharePaymentIntent(input: {
  matchId: string;
  platform: "web" | "native";
  uid: string;
  email?: string | null;
  stripe: Stripe;
}): Promise<FoodSharePaymentIntentResult> {
  const {matchId, platform, uid, email, stripe} = input;
  const db = admin.firestore();

  const matchPath = `matches/${matchId}`;
  const matchSnap = await readDocOrLogMissing(db, matchPath);
  if (!matchSnap.exists) {
    console.error("[PAYMENT MISSING DOC]", matchPath, {
      matchId,
      uid,
      reason: "match_not_found_before_payment_intent",
    });
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match: null,
      reason: "payment_intent_match_not_found_throw",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Match not found.",
    );
  }

  const match = matchSnap.data() ?? {};
  console.log("[PAYMENT MATCH DATA]", matchPath, {
    matchId,
    lifecycle: match.lifecycle ?? null,
    adminFoodShareId: match.adminFoodShareId ?? match.foodShareId ?? null,
    users: match.users ?? null,
  });

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
    lifecycle !== "WAITING_FOR_PAYMENT_CONFIRMATION" &&
    lifecycle !== "PAYMENT_CONFIRMED"
  ) {
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "payment_intent_lifecycle_not_awaiting_payment",
      extra: {uid},
    }));
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
    console.error("[PAYMENT MISSING DOC]", matchPath, {
      matchId,
      reason: "match_missing_food_share_reference",
      match,
    });
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "payment_intent_missing_food_share_reference",
      extra: {uid},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Match missing food share reference.",
    );
  }

  const sharePath = `adminFoodShares/${adminFoodShareId}`;
  const shareSnap = await readDocOrLogMissing(db, sharePath);
  if (!shareSnap.exists) {
    console.error("[PAYMENT MISSING DOC]", sharePath, {
      matchId,
      adminFoodShareId,
      match,
    });
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      reason: "payment_intent_food_share_not_found",
      extra: {uid, adminFoodShareId},
    }));
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Food share not found.",
    );
  }
  if (shareSnap.data()?.active !== true) {
    console.error("[PAYMENT MISSING DOC]", sharePath, {
      matchId,
      adminFoodShareId,
      active: shareSnap.data()?.active ?? null,
      share: shareSnap.data() ?? null,
    });
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      share: shareSnap.data() ?? null,
      reason: "payment_intent_food_share_not_active",
      extra: {uid, adminFoodShareId},
    }));
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

  // Prefer fees configured on the admin food share; else restaurant doc; else defaults.
  let serviceFee: number | null =
    typeof share.serviceFee === "number" ? share.serviceFee : null;
  let taxRate: number | null =
    typeof share.taxRate === "number" ? share.taxRate : null;
  const restaurantId =
    typeof share.restaurantId === "string" ? share.restaurantId.trim() : "";
  if (restaurantId && (serviceFee == null || taxRate == null)) {
    const restSnap = await db.doc(`restaurants/${restaurantId}`).get();
    if (restSnap.exists) {
      const rest = restSnap.data() ?? {};
      if (serviceFee == null && typeof rest.serviceFee === "number") {
        serviceFee = rest.serviceFee;
      }
      if (taxRate == null && typeof rest.taxRate === "number") {
        taxRate = rest.taxRate;
      }
    }
  }
  // Platform default tax when still unset
  if (taxRate == null) {
    const feeSnap = await db.doc("platformSettings/fees").get();
    if (feeSnap.exists && typeof feeSnap.data()?.defaultTaxRate === "number") {
      taxRate = feeSnap.data()!.defaultTaxRate as number;
    }
  }

  const quote = quoteFoodSharePayment({
    sharedPrice,
    deliveryShare,
    serviceFee,
    taxRate,
  });

  const paymentId = foodSharePaymentDocId(matchId, uid);
  const paymentPath = `payments/${paymentId}`;
  const paymentRef = db.doc(paymentPath);
  const existingPayment = await readDocOrLogMissing(db, paymentPath);
  if (existingPayment.exists) {
    const ps = existingPayment.data()?.paymentStatus;
    if (ps === "PAID") {
      throw new functions.https.HttpsError(
        "already-exists",
        "Payment already completed.",
      );
    }
  }

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
        serviceFeeCents: quote.serviceFeeCents,
        taxCents: quote.taxCents,
        promoDiscountCents: quote.promoDiscountCents,
        taxRate: quote.taxRate,
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

    const checkoutUrl =
      typeof session.url === "string" ? session.url.trim() : "";
    if (!checkoutUrl) {
      logger.error("PAYMENT_STATE", paymentDebugState({
        matchId,
        match,
        share,
        reason: "payment_intent_checkout_url_missing",
        extra: {uid, adminFoodShareId, sessionId: session.id},
      }));
      throw new functions.https.HttpsError(
        "internal",
        "Stripe Checkout session URL missing",
      );
    }

    console.log("[PAYMENT INTENT CREATED]", {
      matchId,
      userId: uid,
      checkoutSessionId: session.id,
      amountCents: quote.totalCents,
      platform: "web",
    });

    return {
      kind: "web",
      checkoutSessionId: session.id,
      checkoutUrl,
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
      serviceFeeCents: quote.serviceFeeCents,
      taxCents: quote.taxCents,
      promoDiscountCents: quote.promoDiscountCents,
      taxRate: quote.taxRate,
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
    logger.error("PAYMENT_STATE", paymentDebugState({
      matchId,
      match,
      share,
      reason: "payment_intent_client_secret_missing",
      extra: {uid, adminFoodShareId, paymentIntentId: paymentIntent.id},
    }));
    throw new functions.https.HttpsError(
      "internal",
      "Missing payment intent client secret.",
    );
  }

  console.log("[PAYMENT INTENT CREATED]", {
    matchId,
    userId: uid,
    paymentIntentId: paymentIntent.id,
    amountCents: quote.totalCents,
    platform: "native",
  });

  return {
    kind: "native",
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    customerId,
    ephemeralKey: ephemeralKey.secret ?? null,
    amountCents: quote.totalCents,
  };
}

export function foodShareIntentResponse(
  result: FoodSharePaymentIntentResult,
): Record<string, unknown> {
  if (result.kind === "web") {
    return {
      checkoutSessionId: result.checkoutSessionId,
      checkoutUrl: result.checkoutUrl,
      amountCents: result.amountCents,
    };
  }
  return {
    clientSecret: result.clientSecret,
    paymentIntentId: result.paymentIntentId,
    customerId: result.customerId,
    ephemeralKey: result.ephemeralKey,
    amountCents: result.amountCents,
  };
}

export function isFoodSharePaymentPayload(
  payload: Record<string, unknown>,
): boolean {
  const matchId =
    typeof payload.matchId === "string" ? payload.matchId.trim() : "";
  return Boolean(matchId);
}

export function isFoodShareConfirmPayload(
  payload: Record<string, unknown>,
): boolean {
  if (!isFoodSharePaymentPayload(payload)) return false;
  return (
    payload.confirm === true ||
    payload.purpose === "food_share_confirm" ||
    (typeof payload.paymentIntentId === "string" &&
      payload.paymentIntentId.trim().length > 0 &&
      payload.amount == null &&
      payload.orderId == null)
  );
}

export async function handleFoodSharePaymentCallable(
  data: unknown,
  context: CallableContext,
  stripe: Stripe,
): Promise<Record<string, unknown>> {
  const payload =
    data !== null && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }

  if (isFoodShareConfirmPayload(payload)) {
    try {
      return await confirmFoodSharePaymentCore({
        payload,
        uid,
        stripe,
      });
    } catch (error) {
      logger.error("FOOD_SHARE_CONFIRM_FATAL", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

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
  const email = context.auth?.token.email ?? null;

  const result = await runCreateFoodSharePaymentIntent({
    matchId,
    platform,
    uid,
    email,
    stripe,
  });
  return foodShareIntentResponse(result);
}
