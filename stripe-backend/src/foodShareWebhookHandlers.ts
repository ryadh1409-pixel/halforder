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
import {
  backfillFoodShareDispatchOrderIfNeeded,
  createFoodShareDispatchOrderInTxn,
  isPaidStatus,
} from "./foodShareDispatchOrder.js";
import {
  upsertFoodSharePaymentTransaction,
  updatePaymentTransactionStatus,
  resolvePaymentCardDetails,
} from "./paymentTransactions.js";

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

async function activateMatchIfFullyPaid(
  tx: Transaction,
  matchSnap: DocumentSnapshot,
  userPayments: Record<string, {paymentStatus?: string}>,
): Promise<void> {
  if (!matchSnap.exists) return;
  const match = matchSnap.data() ?? {};
  const users = Array.isArray(match.users)
    ? match.users.filter((x): x is string => typeof x === "string")
    : [];
  if (users.length !== 2) return;

  const allPaid = users.every(
    (u) => isPaidStatus(userPayments[u]?.paymentStatus),
  );
  const anyPaid = users.some(
    (u) => isPaidStatus(userPayments[u]?.paymentStatus),
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

  const {orderId, created: orderCreated} = await createFoodShareDispatchOrderInTxn(
    tx,
    matchId,
    match,
    users,
  );

  tx.set(
    matchSnap.ref,
    {
      status: "matched",
      lifecycle: "ORDER_PLACED",
      paymentStatus: "paid",
      orderId,
      orderStatus: "order_placed",
      deliveryStatus: "pending",
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  console.log("[FOOD SHARE ORDER_PLACED]", {
    matchId,
    orderId,
    orderCreated,
    lifecycle: "ORDER_PLACED",
    matchPath: `matches/${matchId}`,
    orderPath: `orders/${orderId}`,
  });

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
  console.log("[CHAT CREATED]", {
    matchChatId,
    matchId,
    adminFoodShareId,
    trigger: "both_users_paid",
  });
}

export async function withFoodShareEventIdempotency(
  event: Stripe.Event,
  matchId: string,
  apply: (
    tx: Transaction,
    matchSnap: DocumentSnapshot,
  ) => void | Promise<void>,
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
    await apply(tx, matchSnap);
  });

  return duplicate ? "duplicate" : "applied";
}

export async function handleFoodSharePaymentIntentEvent(
  event: Stripe.Event,
  pi: Stripe.PaymentIntent,
  stripe?: Stripe,
): Promise<boolean> {
  const metadata = (pi.metadata ?? {}) as Record<string, string>;
  if (!isFoodSharePaymentMetadata(metadata)) return false;

  console.log("[WEBHOOK RECEIVED]", {
    eventId: event.id,
    eventType: event.type,
    matchId: metadata.matchId,
    userId: metadata.userId,
    paymentIntentId: pi.id,
  });

  const matchId = metadata.matchId?.trim() ?? "";
  const userId = metadata.userId?.trim() ?? "";
  if (!matchId || !userId) return false;

  const paymentStatus = paymentStatusFromEvent(event.type);
  const paymentId = foodSharePaymentDocId(matchId, userId);
  const db = admin.firestore();
  let activated = false;

  let paymentMethodPatch: Record<string, unknown> = {};
  if (stripe && paymentStatus === "PAID") {
    try {
      const card = await resolvePaymentCardDetails(stripe, pi);
      paymentMethodPatch = {
        paymentMethodBrand: card.brand,
        paymentMethodLast4: card.last4,
        paymentMethodLabel: card.label,
      };
    } catch (err) {
      console.error("[PAYMENT CARD DETAILS ERROR]", {
        matchId,
        userId,
        paymentIntentId: pi.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const outcome = await withFoodShareEventIdempotency(
    event,
    matchId,
    async (tx, matchSnap) => {
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
          ...paymentMethodPatch,
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
        await activateMatchIfFullyPaid(tx, matchSnap, userPayments);
        const allPaid = (Array.isArray(match.users) ? match.users : []).every(
          (u: unknown) =>
            typeof u === "string" && isPaidStatus(userPayments[u]?.paymentStatus),
        );
        activated =
          allPaid &&
          beforeLifecycle !== "MATCHED" &&
          beforeLifecycle !== "ORDER_PLACED";
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
        const partnerPaid = isPaidStatus(
          (match.userPayments as Record<string, {paymentStatus?: string}> | undefined)?.[
            partnerUid
          ]?.paymentStatus,
        );
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

  if (paymentStatus === "PAID") {
    await backfillFoodShareDispatchOrderIfNeeded(matchId);
  }

  if (stripe) {
    try {
      if (paymentStatus === "PAID") {
        await upsertFoodSharePaymentTransaction({
          stripe,
          pi,
          matchId,
          userId,
          status: "paid",
          eventType: event.type,
        });
      } else if (paymentStatus === "FAILED") {
        await upsertFoodSharePaymentTransaction({
          stripe,
          pi,
          matchId,
          userId,
          status: "failed",
          eventType: event.type,
        });
      }
    } catch (err) {
      console.error("[PAYMENT TRANSACTION ERROR]", {
        matchId,
        userId,
        paymentIntentId: pi.id,
        message: err instanceof Error ? err.message : String(err),
      });
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
    const paymentIntentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? "";
    if (paymentIntentId) {
      try {
        await updatePaymentTransactionStatus({
          paymentIntentId,
          status: "refunded",
          eventType: event.type,
        });
      } catch (err) {
        console.error("[PAYMENT TRANSACTION REFUND ERROR]", {
          paymentIntentId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
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
