import * as crypto from "crypto";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import type Stripe from "stripe";
import { writeFoodShareInbox } from "./foodShareServerNotify.js";

const CAMPAIGNS = "completeMealCampaigns";
const PAYMENTS = "completeMealPayments";
const STRIPE_MIN_CENTS = 50;
const MIN_OWNER_CENTS = 500;

export type CompleteMealStatus =
  | "awaiting_owner_payment"
  | "open"
  | "funded"
  | "ordered"
  | "cancelled";

type OrderDraftItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
};

export type CompleteMealOrderDraft = {
  restaurantId: string;
  restaurantName: string;
  items: OrderDraftItem[];
  totalPrice: number;
  foodSubtotal: number;
  tax: number;
  taxRate: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  promoCode: string | null;
  deliveryType: "delivery" | "pickup";
  deliveryLocation: {lat: number; lng: number; address: string};
  customerLocation?: {
    latitude: number;
    longitude: number;
    timestamp?: number;
  } | null;
};

function requireUid(context: CallableContext): string {
  const uid = context.auth?.uid?.trim() ?? "";
  if (!uid || context.auth?.token?.firebase?.sign_in_provider === "anonymous") {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Please sign in to continue.",
    );
  }
  return uid;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function roundCents(n: number): number {
  return Math.round(Math.max(0, n));
}

function dollarsToCents(n: number): number {
  return roundCents(n * 100);
}

function mealLabelFromDraft(draft: CompleteMealOrderDraft): string {
  const first = draft.items[0]?.name?.trim();
  if (first && draft.items.length === 1) return first;
  if (first) return `${first} + more`;
  return "Meal";
}

function firstNameFromUser(data: Record<string, unknown>): string {
  const name =
    (typeof data.firstName === "string" && data.firstName.trim()) ||
    (typeof data.name === "string" && data.name.trim().split(/\s+/)[0]) ||
    "Friend";
  return name;
}

function validateOrderDraft(raw: unknown): CompleteMealOrderDraft {
  const d = asRecord(raw);
  const restaurantId =
    typeof d.restaurantId === "string" ? d.restaurantId.trim() : "";
  const restaurantName =
    typeof d.restaurantName === "string" ? d.restaurantName.trim() : "Restaurant";
  const itemsRaw = Array.isArray(d.items) ? d.items : [];
  const items: OrderDraftItem[] = [];
  for (const row of itemsRaw) {
    const r = asRecord(row);
    const id = typeof r.id === "string" ? r.id : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const price = typeof r.price === "number" ? r.price : NaN;
    const qty = typeof r.qty === "number" ? r.qty : NaN;
    if (!id || !name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    items.push({
      id,
      name,
      price,
      qty,
      image: typeof r.image === "string" ? r.image : null,
    });
  }
  const deliveryLocation = asRecord(d.deliveryLocation);
  const lat = typeof deliveryLocation.lat === "number" ? deliveryLocation.lat : NaN;
  const lng = typeof deliveryLocation.lng === "number" ? deliveryLocation.lng : NaN;
  const address =
    typeof deliveryLocation.address === "string"
      ? deliveryLocation.address.trim()
      : "";
  const totalPrice = typeof d.totalPrice === "number" ? d.totalPrice : NaN;
  if (
    !restaurantId ||
    items.length === 0 ||
    !Number.isFinite(totalPrice) ||
    totalPrice <= 0 ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !address
  ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid Complete My Meal order details.",
    );
  }
  const deliveryType = d.deliveryType === "pickup" ? "pickup" : "delivery";
  const customerLocation = asRecord(d.customerLocation);
  return {
    restaurantId,
    restaurantName: restaurantName || "Restaurant",
    items,
    totalPrice,
    foodSubtotal:
      typeof d.foodSubtotal === "number" ? d.foodSubtotal : totalPrice,
    tax: typeof d.tax === "number" ? d.tax : 0,
    taxRate: typeof d.taxRate === "number" ? d.taxRate : 0.13,
    deliveryFee: typeof d.deliveryFee === "number" ? d.deliveryFee : 0,
    serviceFee: typeof d.serviceFee === "number" ? d.serviceFee : 0,
    promoDiscount: typeof d.promoDiscount === "number" ? d.promoDiscount : 0,
    promoCode: typeof d.promoCode === "string" ? d.promoCode : null,
    deliveryType,
    deliveryLocation: {lat, lng, address},
    customerLocation:
      typeof customerLocation.latitude === "number" &&
      typeof customerLocation.longitude === "number"
        ? {
            latitude: customerLocation.latitude,
            longitude: customerLocation.longitude,
            timestamp:
              typeof customerLocation.timestamp === "number"
                ? customerLocation.timestamp
                : Date.now(),
          }
        : null,
  };
}

function clampOwnerPay(ownerPayCents: number, totalCents: number): number {
  const total = roundCents(totalCents);
  const pay = roundCents(ownerPayCents);
  const minOwner = Math.min(total, Math.max(MIN_OWNER_CENTS, STRIPE_MIN_CENTS));
  if (pay < minOwner) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Pay at least $${(minOwner / 100).toFixed(2)} to start Complete My Meal.`,
    );
  }
  if (pay > total) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Pay now cannot exceed the order total.",
    );
  }
  if (pay < total && total - pay < STRIPE_MIN_CENTS) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Leave at least $0.50 remaining for friends, or pay the full amount.",
    );
  }
  return pay;
}

function publicCampaignView(
  campaignId: string,
  data: Record<string, unknown>,
  viewerUid?: string | null,
) {
  const totalCents = roundCents(Number(data.totalCents) || 0);
  const paidCents = roundCents(Number(data.paidCents) || 0);
  const remainingCents = Math.max(0, totalCents - paidCents);
  const contributors = Array.isArray(data.contributors)
    ? (data.contributors as Record<string, unknown>[])
        .filter((c) => String(c.status ?? "").toUpperCase() === "PAID")
        .map((c) => ({
          contributionId: String(c.contributionId ?? ""),
          uid: String(c.uid ?? ""),
          displayName: String(c.displayName ?? "Friend"),
          amountCents: roundCents(Number(c.amountCents) || 0),
          paidAt:
            typeof c.paidAtMs === "number"
              ? c.paidAtMs
              : null,
        }))
    : [];
  const status = String(data.status ?? "open") as CompleteMealStatus;
  const ownerUid = String(data.ownerUid ?? "");
  const contributorCountBeyondOwner = contributors.filter(
    (c) => c.uid !== ownerUid,
  ).length;
  return {
    campaignId,
    shareToken: String(data.shareToken ?? ""),
    status,
    ownerUid,
    ownerFirstName: String(data.ownerFirstName ?? "Friend"),
    restaurantId: String(data.restaurantId ?? ""),
    restaurantName: String(data.restaurantName ?? "Restaurant"),
    mealLabel: String(data.mealLabel ?? "Meal"),
    totalCents,
    paidCents,
    remainingCents,
    progressRatio: totalCents > 0 ? Math.min(1, paidCents / totalCents) : 0,
    contributors,
    orderId: typeof data.orderId === "string" ? data.orderId : null,
    canCancel:
      status === "open" &&
      contributorCountBeyondOwner === 0 &&
      (!viewerUid || viewerUid === ownerUid),
    feature: "complete_my_meal" as const,
  };
}

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
    metadata: {uid},
    ...(email ? {email} : {}),
  });
  await userRef.set({stripeCustomerId: customer.id}, {merge: true});
  return customer.id;
}

async function notifyOwner(
  ownerUid: string,
  title: string,
  body: string,
  campaignId: string,
  pushType: string,
): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: ownerUid,
    type: "complete_meal",
    title,
    body,
    deepLink: `/complete-meal/${encodeURIComponent(campaignId)}`,
    pushType,
  });
}

/** Create campaign in awaiting_owner_payment — owner pays next. */
export async function createCompleteMealCampaignCore(
  data: unknown,
  context: CallableContext,
): Promise<{campaignId: string; shareToken: string; ownerPayCents: number; remainingCents: number}> {
  const uid = requireUid(context);
  const payload = asRecord(data);
  const orderDraft = validateOrderDraft(payload.orderDraft);
  const totalCents = dollarsToCents(orderDraft.totalPrice);
  const ownerPayCents = clampOwnerPay(
    typeof payload.ownerPayCents === "number" ? payload.ownerPayCents : 0,
    totalCents,
  );

  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  const userData = userSnap.data() ?? {};
  const ownerFirstName =
    (typeof payload.ownerFirstName === "string" && payload.ownerFirstName.trim()) ||
    firstNameFromUser(userData);

  const shareToken = crypto.randomBytes(18).toString("hex");
  const ref = admin.firestore().collection(CAMPAIGNS).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  await ref.set({
    feature: "complete_my_meal",
    status: "awaiting_owner_payment",
    ownerUid: uid,
    ownerFirstName,
    shareToken,
    restaurantId: orderDraft.restaurantId,
    restaurantName: orderDraft.restaurantName,
    mealLabel: mealLabelFromDraft(orderDraft),
    orderDraft,
    totalCents,
    paidCents: 0,
    remainingCents: totalCents,
    ownerPayCents,
    contributors: [],
    orderId: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    campaignId: ref.id,
    shareToken,
    ownerPayCents,
    remainingCents: totalCents - ownerPayCents,
  };
}

export async function getCompleteMealCampaignCore(
  data: unknown,
  context: CallableContext,
): Promise<ReturnType<typeof publicCampaignView>> {
  const payload = asRecord(data);
  const campaignId =
    typeof payload.campaignId === "string" ? payload.campaignId.trim() : "";
  const shareToken =
    typeof payload.shareToken === "string" ? payload.shareToken.trim() : "";
  if (!campaignId && !shareToken) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "campaignId or shareToken is required.",
    );
  }

  const db = admin.firestore();
  let snap: admin.firestore.DocumentSnapshot | undefined;
  if (campaignId) {
    snap = await db.doc(`${CAMPAIGNS}/${campaignId}`).get();
  } else {
    const q = await db
      .collection(CAMPAIGNS)
      .where("shareToken", "==", shareToken)
      .limit(1)
      .get();
    snap = q.docs[0];
  }
  if (!snap?.exists) {
    throw new functions.https.HttpsError("not-found", "Campaign not found.");
  }
  const viewerUid = context.auth?.uid ?? null;
  return publicCampaignView(snap.id, snap.data() ?? {}, viewerUid);
}

export async function cancelCompleteMealCampaignCore(
  data: unknown,
  context: CallableContext,
): Promise<{ok: true}> {
  const uid = requireUid(context);
  const campaignId =
    typeof asRecord(data).campaignId === "string"
      ? String(asRecord(data).campaignId).trim()
      : "";
  if (!campaignId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing campaignId.");
  }
  const ref = admin.firestore().doc(`${CAMPAIGNS}/${campaignId}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found.");
    }
    const d = snap.data() ?? {};
    if (d.ownerUid !== uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the owner can cancel.",
      );
    }
    if (String(d.status) !== "open") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This campaign can no longer be cancelled.",
      );
    }
    const contributors = Array.isArray(d.contributors) ? d.contributors : [];
    const friendPaid = contributors.some(
      (c) =>
        asRecord(c).uid !== uid &&
        String(asRecord(c).status ?? "").toUpperCase() === "PAID",
    );
    if (friendPaid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cancel is unavailable after friends have contributed.",
      );
    }
    tx.update(ref, {
      status: "cancelled",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return {ok: true};
}

async function createOrderFromCampaign(
  campaignId: string,
  campaign: Record<string, unknown>,
): Promise<string> {
  const draft = validateOrderDraft(campaign.orderDraft);
  const ownerUid = String(campaign.ownerUid ?? "");
  const orderRef = admin.firestore().collection("orders").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const receiptNumber = `HO-CM-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  const restaurantSnap = await admin
    .firestore()
    .doc(`restaurants/${draft.restaurantId}`)
    .get();
  const restaurant = restaurantSnap.data() ?? {};
  const userSnap = await admin.firestore().doc(`users/${ownerUid}`).get();
  const user = userSnap.data() ?? {};

  const orderPayload = {
    userId: ownerUid,
    customerId: ownerUid,
    restaurantId: draft.restaurantId,
    venueId: draft.restaurantId,
    items: draft.items,
    subtotal: draft.foodSubtotal,
    tax: draft.tax,
    taxRate: draft.taxRate,
    deliveryFee: draft.deliveryFee,
    serviceFee: draft.serviceFee,
    promoDiscount: draft.promoDiscount,
    promoCode: draft.promoCode,
    receiptNumber,
    totalPrice: draft.totalPrice,
    total: draft.totalPrice,
    customerTotal: draft.totalPrice,
    deliveryType: draft.deliveryType,
    status: "payment_confirmed",
    deliveryStatus: "pending",
    paymentStatus: "paid",
    paidAt: now,
    completeMealCampaignId: campaignId,
    orderSource: "complete_my_meal",
    type: "complete_meal",
    stripePaymentIntentId: null,
    paymentIntentId: null,
    groupId: null,
    driverId: null,
    assignedDriverId: null,
    deliveryLocation: draft.deliveryLocation,
    userLocation: {
      lat: draft.deliveryLocation.lat,
      lng: draft.deliveryLocation.lng,
    },
    customerLocation: draft.customerLocation ?? {
      latitude: draft.deliveryLocation.lat,
      longitude: draft.deliveryLocation.lng,
      timestamp: Date.now(),
    },
    restaurantSnapshot: {
      id: draft.restaurantId,
      name:
        typeof restaurant.name === "string"
          ? restaurant.name
          : draft.restaurantName,
      image:
        typeof restaurant.image === "string"
          ? restaurant.image
          : typeof restaurant.logoUrl === "string"
            ? restaurant.logoUrl
            : null,
      address:
        typeof restaurant.address === "string" ? restaurant.address : null,
      latitude: draft.deliveryLocation.lat,
      longitude: draft.deliveryLocation.lng,
    },
    customerSnapshot: {
      id: ownerUid,
      name: typeof user.name === "string" ? user.name : String(campaign.ownerFirstName ?? ""),
      avatar:
        typeof user.avatar === "string"
          ? user.avatar
          : typeof user.photoURL === "string"
            ? user.photoURL
            : null,
      address: draft.deliveryLocation.address,
    },
    createdAt: now,
    updatedAt: now,
  };

  await orderRef.set(orderPayload);

  // Driver marketplace pool (delivery only) — mirror food-share style entry.
  if (draft.deliveryType === "delivery") {
    await admin
      .firestore()
      .doc(`driver_marketplace_pool/${orderRef.id}`)
      .set(
        {
          orderId: orderRef.id,
          restaurantId: draft.restaurantId,
          customerId: ownerUid,
          status: "open",
          deliveryStatus: "pending",
          paymentStatus: "paid",
          deliveryType: "delivery",
          createdAt: now,
          updatedAt: now,
        },
        {merge: true},
      );
  }

  return orderRef.id;
}

async function applySuccessfulContribution(input: {
  campaignId: string;
  uid: string;
  amountCents: number;
  paymentIntentId: string;
  displayName: string;
  role: "owner" | "contributor";
}): Promise<{orderId: string | null; funded: boolean; remainingCents: number}> {
  const ref = admin.firestore().doc(`${CAMPAIGNS}/${input.campaignId}`);
  const paymentRef = admin
    .firestore()
    .doc(`${PAYMENTS}/${input.paymentIntentId}`);

  let orderId: string | null = null;
  let funded = false;
  let remainingCents = 0;
  let ownerUid = "";
  let notifyContribution = false;

  await admin.firestore().runTransaction(async (tx) => {
    const paySnap = await tx.get(paymentRef);
    if (paySnap.exists && String(paySnap.data()?.status ?? "").toUpperCase() === "PAID") {
      const camp = (await tx.get(ref)).data() ?? {};
      orderId = typeof camp.orderId === "string" ? camp.orderId : null;
      remainingCents = Math.max(
        0,
        roundCents(Number(camp.totalCents) || 0) - roundCents(Number(camp.paidCents) || 0),
      );
      funded = String(camp.status) === "ordered" || String(camp.status) === "funded";
      return;
    }

    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found.");
    }
    const camp = snap.data() ?? {};
    ownerUid = String(camp.ownerUid ?? "");
    const status = String(camp.status ?? "");
    if (status === "cancelled") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This Complete My Meal request was cancelled.",
      );
    }
    if (status === "ordered" || status === "funded") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This meal is already fully funded.",
      );
    }
    if (input.role === "owner" && status !== "awaiting_owner_payment") {
      // Owner may also contribute later while open
      if (status !== "open") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Owner payment is not expected in this state.",
        );
      }
    }
    if (input.role === "contributor" && status !== "open") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Contributions are not open yet.",
      );
    }

    const totalCents = roundCents(Number(camp.totalCents) || 0);
    const paidCents = roundCents(Number(camp.paidCents) || 0);
    const remaining = Math.max(0, totalCents - paidCents);
    if (remaining <= 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Nothing left to contribute.",
      );
    }
    if (input.amountCents > remaining) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Contribution would exceed the remaining balance.",
      );
    }

    const nextPaid = paidCents + input.amountCents;
    remainingCents = Math.max(0, totalCents - nextPaid);
    const contributionId = input.paymentIntentId;
    const contributors = Array.isArray(camp.contributors)
      ? [...(camp.contributors as Record<string, unknown>[])]
      : [];
    contributors.push({
      contributionId,
      uid: input.uid,
      displayName: input.displayName,
      amountCents: input.amountCents,
      status: "PAID",
      role: input.role,
      paidAtMs: Date.now(),
      paymentIntentId: input.paymentIntentId,
    });

    let nextStatus: CompleteMealStatus =
      input.role === "owner" && status === "awaiting_owner_payment"
        ? "open"
        : (status as CompleteMealStatus);
    if (remainingCents === 0) {
      nextStatus = "funded";
      funded = true;
    }

    tx.set(
      paymentRef,
      {
        campaignId: input.campaignId,
        uid: input.uid,
        amountCents: input.amountCents,
        paymentIntentId: input.paymentIntentId,
        status: "PAID",
        role: input.role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.update(ref, {
      paidCents: nextPaid,
      remainingCents,
      status: nextStatus,
      contributors,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    notifyContribution = input.role === "contributor";
  });

  if (funded) {
    const campSnap = await ref.get();
    const camp = campSnap.data() ?? {};
    if (typeof camp.orderId === "string" && camp.orderId.trim()) {
      orderId = camp.orderId.trim();
    } else {
      orderId = await createOrderFromCampaign(input.campaignId, camp);
      await ref.set(
        {
          status: "ordered",
          orderId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
    }
    await notifyOwner(
      String(camp.ownerUid ?? ownerUid),
      "Meal completed 🎉",
      "Your Complete My Meal is fully funded — order placed!",
      input.campaignId,
      "complete_meal_funded",
    );
  } else if (notifyContribution && ownerUid) {
    await notifyOwner(
      ownerUid,
      "New contribution",
      `${input.displayName} contributed $${(input.amountCents / 100).toFixed(2)}.`,
      input.campaignId,
      "complete_meal_contribution",
    );
  }

  return {orderId, funded, remainingCents};
}

export async function createCompleteMealPaymentIntentCore(input: {
  data: unknown;
  context: CallableContext;
  stripe: Stripe;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  customerId: string;
  ephemeralKey: string | null;
  amountCents: number;
}> {
  const uid = requireUid(input.context);
  const payload = asRecord(input.data);
  const campaignId =
    typeof payload.campaignId === "string" ? payload.campaignId.trim() : "";
  if (!campaignId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing campaignId.");
  }
  const requestedCents = roundCents(Number(payload.amountCents) || 0);

  const ref = admin.firestore().doc(`${CAMPAIGNS}/${campaignId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Campaign not found.");
  }
  const camp = snap.data() ?? {};
  const status = String(camp.status ?? "");
  const ownerUid = String(camp.ownerUid ?? "");
  const totalCents = roundCents(Number(camp.totalCents) || 0);
  const paidCents = roundCents(Number(camp.paidCents) || 0);
  const remaining = Math.max(0, totalCents - paidCents);

  if (status === "cancelled" || status === "ordered" || status === "funded") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This Complete My Meal is no longer accepting payments.",
    );
  }
  if (remaining <= 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This meal is already fully funded.",
    );
  }

  let amountCents = requestedCents;
  let role: "owner" | "contributor" = "contributor";

  if (status === "awaiting_owner_payment") {
    if (uid !== ownerUid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the owner can make the first payment.",
      );
    }
    role = "owner";
    amountCents = roundCents(Number(camp.ownerPayCents) || requestedCents);
  } else if (status === "open") {
    if (requestedCents < STRIPE_MIN_CENTS) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Minimum contribution is $0.50.",
      );
    }
    amountCents = Math.min(requestedCents, remaining);
    if (uid === ownerUid) role = "owner";
  } else {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Campaign is not accepting payments.",
    );
  }

  if (amountCents < STRIPE_MIN_CENTS || amountCents > remaining) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Invalid contribution amount.",
    );
  }

  const email =
    typeof input.context.auth?.token?.email === "string"
      ? input.context.auth.token.email
      : null;
  const customerId = await getOrCreateStripeCustomer(input.stripe, uid, email);
  const ephemeralKey = await input.stripe.ephemeralKeys.create(
    {customer: customerId},
    {apiVersion: "2025-02-24.acacia"},
  );

  const pi = await input.stripe.paymentIntents.create({
    amount: amountCents,
    currency: "cad",
    customer: customerId,
    automatic_payment_methods: {enabled: true},
    metadata: {
      feature: "complete_my_meal",
      completeMealCampaignId: campaignId,
      contributorUid: uid,
      contributionRole: role,
      amountCents: String(amountCents),
    },
  });

  if (!pi.client_secret) {
    throw new functions.https.HttpsError(
      "internal",
      "Stripe did not return a client secret.",
    );
  }

  await admin
    .firestore()
    .doc(`${PAYMENTS}/${pi.id}`)
    .set(
      {
        campaignId,
        uid,
        amountCents,
        paymentIntentId: pi.id,
        status: "PENDING",
        role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    customerId,
    ephemeralKey: ephemeralKey.secret ?? null,
    amountCents,
  };
}

export async function confirmCompleteMealPaymentCore(input: {
  data: unknown;
  context: CallableContext;
  stripe: Stripe;
}): Promise<{
  ok: true;
  campaignId: string;
  remainingCents: number;
  funded: boolean;
  orderId: string | null;
}> {
  const uid = requireUid(input.context);
  const payload = asRecord(input.data);
  const campaignId =
    typeof payload.campaignId === "string" ? payload.campaignId.trim() : "";
  const paymentIntentId =
    typeof payload.paymentIntentId === "string"
      ? payload.paymentIntentId.trim()
      : "";
  if (!campaignId || !paymentIntentId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "campaignId and paymentIntentId are required.",
    );
  }

  const pi = await input.stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Payment has not succeeded yet.",
    );
  }
  if (pi.metadata?.completeMealCampaignId !== campaignId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Payment does not match this campaign.",
    );
  }
  if (pi.metadata?.contributorUid !== uid) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Payment does not belong to this user.",
    );
  }

  const amountCents = roundCents(
    Number(pi.metadata?.amountCents) || pi.amount || 0,
  );
  const role =
    pi.metadata?.contributionRole === "owner" ? "owner" : "contributor";

  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  const displayName = firstNameFromUser(userSnap.data() ?? {});

  const result = await applySuccessfulContribution({
    campaignId,
    uid,
    amountCents,
    paymentIntentId,
    displayName,
    role,
  });

  // Notify contributor
  await writeFoodShareInbox({
    recipientUid: uid,
    type: "complete_meal",
    title: "Payment successful",
    body: result.funded
      ? "This meal has been completed — thank you!"
      : `You contributed $${(amountCents / 100).toFixed(2)}.`,
    deepLink: `/complete-meal/contribute/${encodeURIComponent(
      String((await admin.firestore().doc(`${CAMPAIGNS}/${campaignId}`).get()).data()?.shareToken ?? ""),
    )}`,
    pushType: result.funded ? "complete_meal_completed" : "complete_meal_paid",
  });

  return {
    ok: true,
    campaignId,
    remainingCents: result.remainingCents,
    funded: result.funded,
    orderId: result.orderId,
  };
}

export function isCompleteMealPaymentMetadata(
  metadata: Stripe.Metadata | null | undefined,
): boolean {
  if (!metadata) return false;
  return (
    metadata.feature === "complete_my_meal" ||
    Boolean(metadata.completeMealCampaignId?.trim())
  );
}

export async function handleCompleteMealPaymentIntentEvent(
  event: Stripe.Event,
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  if (!isCompleteMealPaymentMetadata(pi.metadata)) return false;
  const campaignId = pi.metadata?.completeMealCampaignId?.trim() ?? "";
  const uid = pi.metadata?.contributorUid?.trim() ?? "";
  if (!campaignId || !uid) return true;

  if (event.type === "payment_intent.succeeded") {
    const amountCents = roundCents(
      Number(pi.metadata?.amountCents) || pi.amount || 0,
    );
    const role =
      pi.metadata?.contributionRole === "owner" ? "owner" : "contributor";
    const userSnap = await admin.firestore().doc(`users/${uid}`).get();
    const displayName = firstNameFromUser(userSnap.data() ?? {});
    try {
      await applySuccessfulContribution({
        campaignId,
        uid,
        amountCents,
        paymentIntentId: pi.id,
        displayName,
        role,
      });
    } catch (e) {
      console.warn("[completeMeal] webhook apply failed", e);
    }
  }
  return true;
}
