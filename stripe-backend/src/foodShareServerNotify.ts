import * as admin from "firebase-admin";

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

async function getExpoPushToken(uid: string): Promise<string | null> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const t = data[key];
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  const sub = await admin
    .firestore()
    .doc(`users/${uid}/pushToken/default`)
    .get();
  if (sub.exists) {
    const t = sub.data()?.token;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return null;
}

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          to: token,
          title,
          body,
          sound: "default",
          priority: "high",
          data,
        },
      ]),
    });
  } catch (e) {
    console.warn("[foodShareServerNotify] push failed", e);
  }
}

export async function writeFoodShareInbox(input: {
  recipientUid: string;
  type: string;
  title: string;
  body: string;
  deepLink: string;
  orderId?: string;
  matchId?: string;
  adminFoodShareId?: string;
  pushType?: string;
  skipPush?: boolean;
  notificationId?: string;
}): Promise<void> {
  const uid = input.recipientUid.trim();
  if (!uid) return;

  const db = admin.firestore();
  const inboxRef = input.notificationId ?
    db.doc(`users/${uid}/inboxNotifications/${input.notificationId}`) :
    db.collection(`users/${uid}/inboxNotifications`).doc();
  const notificationId = input.notificationId ?? inboxRef.id;
  const payload = {
    recipientUid: uid,
    userId: uid,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    deepLink: input.deepLink,
    orderId: input.orderId ?? input.matchId ?? null,
    matchId: input.matchId ?? null,
    adminFoodShareId: input.adminFoodShareId ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await Promise.all([
    inboxRef.set(payload, {merge: true}),
    db.doc(`notifications/${notificationId}`).set(
      {
        userId: uid,
        orderId: input.orderId ?? input.matchId ?? null,
        title: input.title,
        body: input.body,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: input.type,
        deepLink: input.deepLink,
        matchId: input.matchId ?? null,
        adminFoodShareId: input.adminFoodShareId ?? null,
      },
      {merge: true},
    ),
  ]);

  if (!input.skipPush) {
    const token = await getExpoPushToken(uid);
    if (token) {
      await sendExpoPush(token, input.title, input.body, {
        type: input.pushType ?? "food_share",
        notificationId,
        deepLink: input.deepLink,
        ...(input.matchId ? {matchId: input.matchId} : {}),
      });
    }
  }
}

export async function notifyFoodSharePaymentSucceeded(input: {
  userId: string;
  matchId: string;
  foodName: string;
  notificationId?: string;
}): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: input.userId,
    type: "payment_success",
    title: "Payment successful",
    body: "The payment was successful. Proceed to the pickup location.",
    deepLink: `/food-share-pay/${input.matchId}`,
    orderId: input.matchId,
    matchId: input.matchId,
    pushType: "food_share_payment_success",
    notificationId: input.notificationId,
  });
}

export async function notifyFoodSharePaymentFailed(input: {
  userId: string;
  matchId: string;
  foodName: string;
}): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: input.userId,
    type: "payment_failed",
    title: "Payment failed",
    body: `We could not process your payment for ${input.foodName}. Tap to try again.`,
    deepLink: `/food-share-pay/${input.matchId}`,
    matchId: input.matchId,
    pushType: "food_share_payment_failed",
  });
}

export async function notifyFoodSharePartnerPaid(input: {
  recipientUid: string;
  partnerFirstName: string;
  foodName: string;
  matchId: string;
  notificationId?: string;
}): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: input.recipientUid,
    type: "partner_paid",
    title: "Payment needed",
    body: "The other participant has completed payment. Please complete your payment to continue.",
    deepLink: `/food-share-pay/${input.matchId}`,
    orderId: input.matchId,
    matchId: input.matchId,
    pushType: "food_share_partner_paid",
    notificationId: input.notificationId,
  });
}

export async function notifyFoodShareMatchActivated(input: {
  recipientUid: string;
  partnerFirstName: string;
  foodName: string;
  matchId: string;
}): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: input.recipientUid,
    type: "match_activated",
    title: "Match activated",
    body: `You and ${input.partnerFirstName} are matched for ${input.foodName}. Chat to coordinate delivery.`,
    deepLink: `/food-share-chat/${input.matchId}`,
    matchId: input.matchId,
    pushType: "food_share_match_activated",
  });
}

export async function notifyFoodShareRefundProcessed(input: {
  userId: string;
  matchId: string;
  foodName: string;
}): Promise<void> {
  await writeFoodShareInbox({
    recipientUid: input.userId,
    type: "refund_processed",
    title: "Refund processed",
    body: `Your payment for ${input.foodName} has been refunded.`,
    deepLink: `/food-share-match/${input.matchId}`,
    matchId: input.matchId,
    pushType: "food_share_refund_processed",
  });
}
