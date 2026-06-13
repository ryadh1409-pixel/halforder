import * as admin from "firebase-admin";
import type {DocumentSnapshot, Transaction} from "firebase-admin/firestore";
import type Stripe from "stripe";
import {
  notifyFoodShareMatchActivated,
  notifyFoodSharePartnerPaid,
  notifyFoodSharePaymentFailed,
  notifyFoodSharePaymentSucceeded,
  notifyFoodShareRefundProcessed,
} from "./foodShareServerNotify.js";

import {
  foodSharePaymentDocId,
  isFoodSharePaymentMetadata,
  type FoodSharePaymentStatus,
} from "./foodSharePaymentLogic.js";

const PROCESSED_EVENTS = "stripe_processed_events";

function paymentStatusFromEvent(eventType: string): FoodSharePaymentStatus {
  if (eventType === "payment_intent.succeeded") return "PAID";
  if (eventType === "payment_intent.payment_failed") return "FAILED";
  if (eventType === "charge.refunded") return "REFUNDED";
  return "PENDING";
}

function partnerUidFor(users: string[], payerUid: string): string | null {
  const other = users.find((u) => u !== payerUid);
  return other ?? null;
}

function firstNameFromMatch(
  match: Record<string, unknown>,
  uid: string,
): string {
  const userA = (match.userA ?? {}) as Record<string, unknown>;
  const userB = (match.userB ?? {}) as Record<string, unknown>;
  if (userA.uid === uid && typeof userA.firstName === "string") {
    return userA.firstName;
  }
  if (userB.uid === uid && typeof userB.firstName === "string") {
    return userB.firstName;
  }
  return "Your partner";
}

function activateMatchIfFullyPaid(
  tx: Transaction,
  matchSnap: DocumentSnapshot,
  userPayments: Record<string, {paymentStatus?: string}>,
): void {
  if (!matchSnap.exists) return;
  const match = matchSnap.data() ?? {};
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (users.length !== 2) return;

  const allPaid = users.every(
    (u) => userPayments[u]?.paymentStatus === "PAID",
  );
  const anyPaid = users.some(
    (u) => userPayments[u]?.paymentStatus === "PAID",
  );

  if (!allPaid) {
    tx.set(
      matchSnap.ref,
      {
        lifecycle: anyPaid ? "PAYMENT_CONFIRMED" : "WAITING_FOR_PAYMENT",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  const matchId = matchSnap.id;
  const adminFoodShareId =
    typeof match.adminFoodShareId === "string"
      ? match.adminFoodShareId
      : "";
  const foodName =
    typeof match.foodName === "string" ? match.foodName : "Shared meal";
  const restaurantName =
    typeof match.restaurantName === "string"
      ? match.restaurantName
      : "Restaurant";
  const matchChatId =
    typeof match.matchChatId === "string" ? match.matchChatId : matchId;

  tx.set(
    matchSnap.ref,
    {
      status: "matched",
      lifecycle: "MATCHED",
      paymentStatus: "paid",
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  const chatRef = admin.firestore().doc(`matchChats/${matchChatId}`);
  tx.set(
    chatRef,
    {
      matchId,
      adminFoodShareId,
      foodShareId: adminFoodShareId,
      participantIds: users,
      foodName,
      restaurantName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  tx.set(chatRef.collection("matchMessages").doc("welcome"), {
    senderId: "system",
    senderFirstName: "HalfOrder",
    text: `Payment confirmed! You're matched to split ${foodName}. Say hi and coordinate delivery!`,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function withFoodShareEventIdempotency(
  event: Stripe.Event,
  matchId: string,
  apply: (tx: Transaction, matchSnap: DocumentSnapshot) => void,
): Promise<"duplicate" | "applied"> {
  const db = admin.firestore();
  const evRef = db.collection(PROCESSED_EVENTS).doc(`fs_${event.id}`);
  const matchRef = db.doc(`matches/${matchId}`);
  let duplicate = false;

  await db.runTransaction(async (tx) => {
    const [existing, matchSnap] = await Promise.all([
      tx.get(evRef),
      tx.get(matchRef),
    ]);
    if (existing.exists) {
      duplicate = true;
      return;
    }
    tx.set(evRef, {
      stripeEventId: event.id,
      type: event.type,
      scope: "food_share",
      matchId,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    apply(tx, matchSnap);
  });

  return duplicate ? "duplicate" : "applied";
}

export async function handleFoodSharePaymentIntentEvent(
  event: Stripe.Event,
  pi: Stripe.PaymentIntent,
): Promise<boolean> {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  if (!isFoodSharePaymentMetadata(metadata)) return false;

  const matchId = metadata.matchId?.trim() ?? "";
  const userId = metadata.userId?.trim() ?? "";
  if (!matchId || !userId) return false;

  const paymentStatus = paymentStatusFromEvent(event.type);
  const paymentId = foodSharePaymentDocId(matchId, userId);
  const db = admin.firestore();
  let activated = false;

  const outcome = await withFoodShareEventIdempotency(
    event,
    matchId,
    (tx, matchSnap) => {
      const match = matchSnap.data() ?? {};
      const prior = (match.userPayments ?? {}) as Record<
        string,
        {paymentStatus?: string; stripePaymentIntentId?: string; amount?: number}
      >;
      const userPayments = {
        ...prior,
        [userId]: {
          paymentStatus,
          stripePaymentIntentId: pi.id,
          amount: pi.amount,
        },
      };

      tx.set(
        db.doc(`payments/${paymentId}`),
        {
          type: "food_share",
          matchId,
          userId,
          stripePaymentIntentId: pi.id,
          paymentStatus,
          amount: pi.amount,
          currency: pi.currency,
          paidAt:
            paymentStatus === "PAID"
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,
          failedAt:
            paymentStatus === "FAILED"
              ? admin.firestore.FieldValue.serverTimestamp()
              : null,
          stripeWebhookLastEventType: event.type,
          stripeWebhookLastEventId: event.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      tx.set(
        matchSnap.ref,
        {
          userPayments,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );

      if (paymentStatus === "PAID") {
        const beforeLifecycle = String(match.lifecycle ?? "");
        activateMatchIfFullyPaid(tx, matchSnap, userPayments);
        const allPaid = (Array.isArray(match.users) ? match.users : []).every(
          (u: unknown) =>
            typeof u === "string" &&
            userPayments[u]?.paymentStatus === "PAID",
        );
        activated = allPaid && beforeLifecycle !== "MATCHED";
      } else if (paymentStatus === "FAILED") {
        tx.set(
          matchSnap.ref,
          {lifecycle: "WAITING_FOR_PAYMENT"},
          {merge: true},
        );
      }
    },
  );

  if (outcome === "applied") {
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const match = matchSnap.data() ?? {};
    const foodName =
      typeof match.foodName === "string" ? match.foodName : "your meal share";
    const users = Array.isArray(match.users)
      ? match.users.filter((x): x is string => typeof x === "string")
      : [];

    if (paymentStatus === "PAID") {
      await notifyFoodSharePaymentSucceeded({userId, matchId, foodName});
      const partnerUid = partnerUidFor(users, userId);
      if (partnerUid) {
        const payerName = firstNameFromMatch(match, userId);
        const partnerPaid =
          (match.userPayments as Record<string, {paymentStatus?: string}> | undefined)?.[
            partnerUid
          ]?.paymentStatus === "PAID";
        if (!partnerPaid) {
          await notifyFoodSharePartnerPaid({
            recipientUid: partnerUid,
            partnerFirstName: payerName,
            foodName,
            matchId,
          });
        }
      }
      if (activated && users.length === 2) {
        const [u0, u1] = users;
        await Promise.all([
          notifyFoodShareMatchActivated({
            recipientUid: u0,
            partnerFirstName: firstNameFromMatch(match, u1),
            foodName,
            matchId,
          }),
          notifyFoodShareMatchActivated({
            recipientUid: u1,
            partnerFirstName: firstNameFromMatch(match, u0),
            foodName,
            matchId,
          }),
        ]);
      }
    } else if (paymentStatus === "FAILED") {
      await notifyFoodSharePaymentFailed({userId, matchId, foodName});
    }
  }

  console.log(
    "[foodShareWebhook]",
    JSON.stringify({
      msg: "payment_intent_handled",
      outcome,
      matchId,
      userId,
      eventType: event.type,
    }),
  );
  return true;
}

export async function handleFoodShareChargeRefunded(
  event: Stripe.Event,
  charge: Stripe.Charge,
): Promise<boolean> {
  const metadata = (charge.metadata ?? {}) as Record<string, string>;
  if (!isFoodSharePaymentMetadata(metadata)) return false;

  const matchId = metadata.matchId?.trim() ?? "";
  const userId = metadata.userId?.trim() ?? "";
  if (!matchId || !userId) return false;

  const paymentId = foodSharePaymentDocId(matchId, userId);
  const db = admin.firestore();

  const outcome = await withFoodShareEventIdempotency(event, matchId, (tx, matchSnap) => {
    const match = matchSnap.data() ?? {};
    const prior = (match.userPayments ?? {}) as Record<
      string,
      {paymentStatus?: string}
    >;
    const userPayments = {
      ...prior,
      [userId]: {...prior[userId], paymentStatus: "REFUNDED"},
    };

    tx.set(
      db.doc(`payments/${paymentId}`),
      {
        paymentStatus: "REFUNDED",
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        stripeWebhookLastEventType: event.type,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    tx.set(
      matchSnap.ref,
      {userPayments, updatedAt: admin.firestore.FieldValue.serverTimestamp()},
      {merge: true},
    );
  });

  if (outcome === "applied") {
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const foodName =
      typeof matchSnap.data()?.foodName === "string"
        ? (matchSnap.data()?.foodName as string)
        : "your meal share";
    await notifyFoodShareRefundProcessed({userId, matchId, foodName});
  }

  return true;
}

export async function refundFoodSharePaymentsForMatch(
  matchId: string,
): Promise<void> {
  const db = admin.firestore();
  const snap = await db
    .collection("payments")
    .where("matchId", "==", matchId)
    .where("type", "==", "food_share")
    .get();

  const Stripe = (await import("stripe")).default;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  const stripe = new Stripe(key, {apiVersion: "2025-02-24.acacia"});

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.paymentStatus !== "PAID") continue;
    const piId =
      typeof data.stripePaymentIntentId === "string"
        ? data.stripePaymentIntentId
        : "";
    if (!piId) continue;
    try {
      await stripe.refunds.create({payment_intent: piId});
      await doc.ref.set(
        {
          paymentStatus: "REFUNDED",
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundReason: "match_cancelled",
        },
        {merge: true},
      );
    } catch (e) {
      console.warn("[refundFoodShare] failed", piId, e);
    }
  }
}
