import * as admin from "firebase-admin";
import type Stripe from "stripe";

export type PaymentTransactionStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"
  | "disputed";

export type PaymentTransactionRecord = {
  id: string;
  createdAt: FirebaseFirestore.FieldValue;
  paidAt: FirebaseFirestore.FieldValue | null;
  stripePaymentIntentId: string;
  stripeChargeId: string | null;
  amount: number;
  currency: string;
  platformFee: number;
  deliveryFee: number;
  foodAmount: number;
  stripeFee: number;
  netRevenue: number;
  customerId: string;
  customerName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  adminFoodShareId: string | null;
  adminFoodShareName: string | null;
  adminFoodShareImage: string | null;
  matchId: string | null;
  orderId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  driverId: string | null;
  driverName: string | null;
  status: PaymentTransactionStatus;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  receiptUrl: string | null;
  source: "food_share" | "marketplace";
  updatedAt: FirebaseFirestore.FieldValue;
};

const TX_COLLECTION = "paymentTransactions";
const AUDIT_COLLECTION = "paymentAuditLogs";

function db() {
  return admin.firestore();
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function centsToMajor(cents: number): number {
  return Math.round(cents) / 100;
}

function normalizeBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const brand = raw.trim().toLowerCase();
  if (!brand) return null;
  if (brand === "amex" || brand === "american express") return "Amex";
  if (brand === "mastercard") return "Mastercard";
  if (brand === "visa") return "Visa";
  if (brand === "discover") return "Discover";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function formatCardLabel(
  brand: string | null,
  last4: string | null,
): string | null {
  if (!brand && !last4) return null;
  const digits = last4?.trim() || "????";
  return `${brand ?? "Card"} **** ${digits}`;
}

export {formatCardLabel};

export type PaymentCardDetails = {
  brand: string | null;
  last4: string | null;
  label: string | null;
  receiptUrl: string | null;
  stripeChargeId: string | null;
  stripeFee: number;
};

export async function resolvePaymentCardDetails(
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
): Promise<PaymentCardDetails> {
  let charge = await resolveStripeCharge(stripe, pi);
  let card = extractCardDetails(charge);

  if (!card.brand && !card.last4) {
    const freshPi = await stripe.paymentIntents.retrieve(pi.id, {
      expand: ["latest_charge.balance_transaction", "payment_method"],
    });
    charge = await resolveStripeCharge(stripe, freshPi);
    card = extractCardDetails(charge);

    const paymentMethod = freshPi.payment_method;
    if (
      !card.brand &&
      paymentMethod &&
      typeof paymentMethod === "object" &&
      paymentMethod.object === "payment_method" &&
      paymentMethod.card
    ) {
      card = {
        ...card,
        brand: normalizeBrand(paymentMethod.card.brand ?? null),
        last4: paymentMethod.card.last4 ?? null,
      };
    }
  }

  return {
    brand: card.brand,
    last4: card.last4,
    label: formatCardLabel(card.brand, card.last4),
    receiptUrl: card.receiptUrl,
    stripeChargeId: card.stripeChargeId,
    stripeFee: card.stripeFee,
  };
}

export function paymentTransactionDocId(paymentIntentId: string): string {
  return paymentIntentId.trim();
}

export async function appendPaymentAuditLog(input: {
  paymentTransactionId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db().collection(AUDIT_COLLECTION).add({
    paymentTransactionId: input.paymentTransactionId,
    action: input.action,
    actor: input.actor,
    details: input.details ?? {},
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function readUserName(uid: string): Promise<string | null> {
  if (!uid) return null;
  const snap = await db().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  return (
    readString(data.firstName, data.displayName, data.name) || null
  );
}

async function readShareCatalog(adminFoodShareId: string): Promise<{
  foodName: string | null;
  image: string | null;
  restaurantName: string | null;
}> {
  if (!adminFoodShareId) {
    return {foodName: null, image: null, restaurantName: null};
  }
  const snap = await db().doc(`adminFoodShares/${adminFoodShareId}`).get();
  if (!snap.exists) {
    return {foodName: null, image: null, restaurantName: null};
  }
  const data = snap.data() ?? {};
  return {
    foodName: readString(data.foodName, data.title) || null,
    image: readString(data.image, data.foodImageUrl) || null,
    restaurantName: readString(data.restaurantName) || null,
  };
}

function partnerFromMatch(
  match: Record<string, unknown>,
  payerUid: string,
): {partnerId: string | null; partnerName: string | null} {
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  const partnerId = users.find((u) => u !== payerUid) ?? null;
  if (!partnerId) return {partnerId: null, partnerName: null};
  const userA = (match.userA ?? {}) as Record<string, unknown>;
  const userB = (match.userB ?? {}) as Record<string, unknown>;
  let partnerName: string | null = null;
  if (userA.uid === partnerId && typeof userA.firstName === "string") {
    partnerName = userA.firstName;
  } else if (userB.uid === partnerId && typeof userB.firstName === "string") {
    partnerName = userB.firstName;
  }
  return {partnerId, partnerName};
}

function extractCardDetails(charge: Stripe.Charge | null): {
  brand: string | null;
  last4: string | null;
  receiptUrl: string | null;
  stripeChargeId: string | null;
  stripeFee: number;
} {
  if (!charge) {
    return {
      brand: null,
      last4: null,
      receiptUrl: null,
      stripeChargeId: null,
      stripeFee: 0,
    };
  }
  const card = charge.payment_method_details?.card;
  const balanceFee =
    typeof charge.balance_transaction === "object" &&
    charge.balance_transaction !== null &&
    "fee" in charge.balance_transaction &&
    typeof (charge.balance_transaction as {fee?: unknown}).fee === "number"
      ? centsToMajor(
          Number((charge.balance_transaction as {fee: number}).fee),
        )
      : 0;
  return {
    brand: normalizeBrand(card?.brand ?? null),
    last4: card?.last4 ?? null,
    receiptUrl: charge.receipt_url ?? null,
    stripeChargeId: charge.id,
    stripeFee: balanceFee,
  };
}

async function resolveStripeCharge(
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
): Promise<Stripe.Charge | null> {
  const latest = pi.latest_charge;
  if (typeof latest === "string" && latest) {
    return stripe.charges.retrieve(latest, {expand: ["balance_transaction"]});
  }
  if (latest && typeof latest === "object") {
    return latest as Stripe.Charge;
  }
  return null;
}

export async function upsertFoodSharePaymentTransaction(input: {
  stripe: Stripe;
  pi: Stripe.PaymentIntent;
  matchId: string;
  userId: string;
  status: PaymentTransactionStatus;
  eventType: string;
}): Promise<void> {
  const {stripe, pi, matchId, userId, status} = input;
  const txId = paymentTransactionDocId(pi.id);
  const txRef = db().doc(`${TX_COLLECTION}/${txId}`);

  const [matchSnap, paymentSnap] = await Promise.all([
    db().doc(`matches/${matchId}`).get(),
    db().doc(`payments/${matchId}_${userId}`).get(),
  ]);
  const card = await resolvePaymentCardDetails(stripe, pi);
  const match = matchSnap.data() ?? {};
  const payment = paymentSnap.data() ?? {};
  const adminFoodShareId = readString(
    match.adminFoodShareId,
    match.foodShareId,
    payment.adminFoodShareId,
    pi.metadata?.adminFoodShareId,
  );
  const [customerName, shareCatalog] = await Promise.all([
    (async () => {
      const userA = (match.userA ?? {}) as Record<string, unknown>;
      const userB = (match.userB ?? {}) as Record<string, unknown>;
      if (userA.uid === userId && typeof userA.firstName === "string") {
        return userA.firstName;
      }
      if (userB.uid === userId && typeof userB.firstName === "string") {
        return userB.firstName;
      }
      return readUserName(userId);
    })(),
    readShareCatalog(adminFoodShareId),
  ]);
  const {partnerId, partnerName} = partnerFromMatch(match, userId);
  const foodAmount = centsToMajor(
    typeof payment.foodShareCostCents === "number"
      ? payment.foodShareCostCents
      : typeof match.costBreakdown === "object" &&
          match.costBreakdown !== null &&
          typeof (match.costBreakdown as {sharedPrice?: unknown}).sharedPrice ===
            "number"
        ? Math.round(
            Number((match.costBreakdown as {sharedPrice: number}).sharedPrice) *
              100,
          )
        : pi.amount,
  );
  const deliveryFee = centsToMajor(
    typeof payment.deliveryShareCostCents === "number"
      ? payment.deliveryShareCostCents
      : typeof match.costBreakdown === "object" &&
          match.costBreakdown !== null &&
          typeof (match.costBreakdown as {deliveryShare?: unknown})
            .deliveryShare === "number"
        ? Math.round(
            Number(
              (match.costBreakdown as {deliveryShare: number}).deliveryShare,
            ) * 100,
          )
        : 0,
  );
  const platformFee = centsToMajor(
    typeof payment.platformFeeCents === "number" ? payment.platformFeeCents : 0,
  );
  const amount = centsToMajor(pi.amount);
  const netRevenue = Math.max(
    0,
    Math.round((amount - card.stripeFee) * 100) / 100,
  );
  const orderId =
    readString(match.orderId, matchId) || null;
  const payload: Record<string, unknown> = {
    id: txId,
    stripePaymentIntentId: pi.id,
    stripeChargeId: card.stripeChargeId,
    amount,
    currency: (pi.currency ?? "cad").toLowerCase(),
    platformFee,
    deliveryFee,
    foodAmount,
    stripeFee: card.stripeFee,
    netRevenue,
    customerId: userId,
    customerName: customerName ?? null,
    partnerId,
    partnerName,
    adminFoodShareId: adminFoodShareId || null,
    adminFoodShareName:
      shareCatalog.foodName ??
      readString(match.foodName) ??
      null,
    adminFoodShareImage:
      shareCatalog.image ?? readString(match.foodImageUrl) ?? null,
    matchId,
    orderId,
    restaurantId: adminFoodShareId || null,
    restaurantName:
      shareCatalog.restaurantName ??
      readString(match.restaurantName) ??
      null,
    status,
    paymentMethodBrand: card.brand,
    paymentMethodLast4: card.last4,
    paymentMethodLabel: card.label,
    receiptUrl: card.receiptUrl,
    source: "food_share",
    stripeWebhookLastEventType: input.eventType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (status === "paid") {
    payload.paidAt = admin.firestore.FieldValue.serverTimestamp();
  }
  const existing = await txRef.get();
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await txRef.set(payload, {merge: true});
  await appendPaymentAuditLog({
    paymentTransactionId: txId,
    action: existing.exists
      ? status === "paid"
        ? "paid"
        : status
      : "created",
    actor: "stripe_webhook",
    details: {eventType: input.eventType, matchId, userId},
  });
  if (status === "paid" && !existing.exists) {
    await appendPaymentAuditLog({
      paymentTransactionId: txId,
      action: "paid",
      actor: "stripe_webhook",
      details: {eventType: input.eventType, matchId, userId},
    });
  }
  console.log("[PAYMENT TRANSACTION]", {
    txId,
    source: "food_share",
    status,
    amount,
    matchId,
    orderId,
    customerId: userId,
    paymentMethodBrand: card.brand,
    paymentMethodLast4: card.last4,
    paidAt: status === "paid",
  });
}

export async function upsertMarketplacePaymentTransaction(input: {
  stripe: Stripe;
  pi: Stripe.PaymentIntent;
  orderId: string;
  status: PaymentTransactionStatus;
  eventType: string;
}): Promise<void> {
  const {stripe, pi, orderId, status} = input;
  const txId = paymentTransactionDocId(pi.id);
  const txRef = db().doc(`${TX_COLLECTION}/${txId}`);
  const [orderSnap, card] = await Promise.all([
    db().doc(`orders/${orderId}`).get(),
    resolvePaymentCardDetails(stripe, pi),
  ]);
  const order = orderSnap.data() ?? {};
  const customerId = readString(
    pi.metadata?.userId,
    pi.metadata?.uid,
    order.userId,
    order.customerId,
  );
  const [customerName] = await Promise.all([
    readUserName(customerId),
  ]);
  const amount = centsToMajor(pi.amount);
  const deliveryFee =
    typeof order.deliveryFee === "number" ? order.deliveryFee : 0;
  const foodAmount =
    typeof order.subtotal === "number"
      ? order.subtotal
      : Math.max(0, amount - deliveryFee);
  const platformFee = Math.max(
    0,
    Math.round((amount - foodAmount - deliveryFee) * 100) / 100,
  );
  const netRevenue = Math.max(
    0,
    Math.round((amount - card.stripeFee) * 100) / 100,
  );
  const payload: Record<string, unknown> = {
    id: txId,
    stripePaymentIntentId: pi.id,
    stripeChargeId: card.stripeChargeId,
    amount,
    currency: (pi.currency ?? "cad").toLowerCase(),
    platformFee,
    deliveryFee,
    foodAmount,
    stripeFee: card.stripeFee,
    netRevenue,
    customerId,
    customerName,
    partnerId: null,
    partnerName: null,
    adminFoodShareId: null,
    adminFoodShareName: null,
    adminFoodShareImage: null,
    matchId: readString(order.matchId) || null,
    orderId,
    restaurantId: readString(order.restaurantId, pi.metadata?.restaurantId) || null,
    restaurantName: readString(order.restaurantName) || null,
    driverId: readString(order.driverId, order.assignedDriverId) || null,
    driverName: readString(order.driverName) || null,
    status,
    paymentMethodBrand: card.brand,
    paymentMethodLast4: card.last4,
    paymentMethodLabel: card.label,
    receiptUrl: card.receiptUrl,
    source: readString(order.orderSource, order.type) === "food_share"
      ? "food_share"
      : "marketplace",
    stripeWebhookLastEventType: input.eventType,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (status === "paid") {
    payload.paidAt = admin.firestore.FieldValue.serverTimestamp();
  }
  const existing = await txRef.get();
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await txRef.set(payload, {merge: true});
  await appendPaymentAuditLog({
    paymentTransactionId: txId,
    action: status === "paid" ? "paid" : status,
    actor: "stripe_webhook",
    details: {eventType: input.eventType, orderId},
  });
  console.log("[PAYMENT TRANSACTION]", {
    txId,
    source: "marketplace",
    status,
    amount,
    orderId,
    customerId,
  });
}

export async function updatePaymentTransactionStatus(input: {
  paymentIntentId: string;
  status: PaymentTransactionStatus;
  eventType: string;
  actor?: string;
}): Promise<void> {
  const txId = paymentTransactionDocId(input.paymentIntentId);
  const txRef = db().doc(`${TX_COLLECTION}/${txId}`);
  const snap = await txRef.get();
  if (!snap.exists) {
    console.log("[PAYMENT TRANSACTION MISSING]", {
      txId,
      status: input.status,
      eventType: input.eventType,
    });
    return;
  }
  await txRef.set(
    {
      status: input.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeWebhookLastEventType: input.eventType,
    },
    {merge: true},
  );
  await appendPaymentAuditLog({
    paymentTransactionId: txId,
    action: input.status,
    actor: input.actor ?? "stripe_webhook",
    details: {eventType: input.eventType},
  });
}

export async function linkDriverToPaymentTransactions(input: {
  orderId: string;
  driverId: string;
  driverName: string | null;
}): Promise<void> {
  const snap = await db()
    .collection(TX_COLLECTION)
    .where("orderId", "==", input.orderId)
    .get();
  if (snap.empty) {
    const matchSnap = await db()
      .collection(TX_COLLECTION)
      .where("matchId", "==", input.orderId)
      .get();
    if (matchSnap.empty) return;
    await Promise.all(
      matchSnap.docs.map(async (docSnap) => {
        await docSnap.ref.set(
          {
            driverId: input.driverId,
            driverName: input.driverName,
            orderId: input.orderId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
        await appendPaymentAuditLog({
          paymentTransactionId: docSnap.id,
          action: "driver_assigned",
          actor: input.driverId,
          details: {orderId: input.orderId, driverName: input.driverName},
        });
      }),
    );
    return;
  }
  await Promise.all(
    snap.docs.map(async (docSnap) => {
      await docSnap.ref.set(
        {
          driverId: input.driverId,
          driverName: input.driverName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      await appendPaymentAuditLog({
        paymentTransactionId: docSnap.id,
        action: "driver_assigned",
        actor: input.driverId,
        details: {orderId: input.orderId, driverName: input.driverName},
      });
    }),
  );
}

export async function markPaymentTransactionsCompleted(orderId: string): Promise<void> {
  const byOrder = await db()
    .collection(TX_COLLECTION)
    .where("orderId", "==", orderId)
    .get();
  const byMatch = await db()
    .collection(TX_COLLECTION)
    .where("matchId", "==", orderId)
    .get();
  const docs = [...byOrder.docs, ...byMatch.docs];
  await Promise.all(
    docs.map(async (docSnap) => {
      await appendPaymentAuditLog({
        paymentTransactionId: docSnap.id,
        action: "completed",
        actor: "system",
        details: {orderId},
      });
    }),
  );
}
