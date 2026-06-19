import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

type AdminNotificationType =
  | "new_order_created"
  | "new_report_submitted"
  | "payment_failure"
  | "chargeback_refund_request"
  | "user_suspended"
  | "high_risk_moderation"
  | "flagged_chat_message";

type AdminRecipient = {
  uid: string;
  token: string | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function expoTokenFor(uid: string, data?: Record<string, unknown>): Promise<string | null> {
  const row = data ?? {};
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const token = str(row[key]);
    if (token) return token;
  }
  const tokenSnap = await db.doc(`users/${uid}/pushToken/default`).get();
  const token = tokenSnap.exists ? str(tokenSnap.data()?.token) : "";
  return token || null;
}

async function listAdminRecipients(): Promise<AdminRecipient[]> {
  const byUid = new Map<string, Record<string, unknown>>();
  const [roleAdmins, adminDocs] = await Promise.all([
    db.collection("users").where("role", "==", "admin").get(),
    db.collection("admins").get(),
  ]);

  roleAdmins.docs.forEach((doc) => byUid.set(doc.id, doc.data()));

  await Promise.all(
    adminDocs.docs.map(async (adminDoc) => {
      if (byUid.has(adminDoc.id)) return;
      const userSnap = await db.doc(`users/${adminDoc.id}`).get();
      byUid.set(adminDoc.id, userSnap.exists ? userSnap.data() ?? {} : {});
    }),
  );

  const usersSnap = await db.collection("users").where("admin", "==", true).get();
  usersSnap.docs.forEach((doc) => byUid.set(doc.id, doc.data()));

  const recipients = await Promise.all(
    [...byUid.entries()].map(async ([uid, data]) => ({
      uid,
      token: await expoTokenFor(uid, data),
    })),
  );
  return recipients.filter((r) => r.uid);
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await fetch(EXPO_PUSH_SEND_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokens.map((to) => ({
        to,
        title,
        body,
        sound: "default",
        priority: "high",
        data,
      }))),
    });
  } catch (error) {
    logger.warn("[admin-notification] expo_push_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createAdminNotification(input: {
  type: AdminNotificationType;
  title: string;
  body: string;
  orderId?: string | null;
  reportId?: string | null;
  userId?: string | null;
  paymentId?: string | null;
  moderationEventId?: string | null;
  flaggedMessageId?: string | null;
  restaurantName?: string | null;
  hostName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const recipients = await listAdminRecipients();
  const sentTo = recipients.map((r) => r.uid);
  const ref = await db.collection("admin_notifications").add({
    type: input.type,
    title: input.title,
    message: input.body,
    body: input.body,
    readBy: [],
    sentTo,
    sentToCount: sentTo.length,
    orderId: input.orderId ?? null,
    reportId: input.reportId ?? null,
    userId: input.userId ?? null,
    paymentId: input.paymentId ?? null,
    moderationEventId: input.moderationEventId ?? null,
    flaggedMessageId: input.flaggedMessageId ?? null,
    restaurantName: input.restaurantName ?? null,
    hostName: input.hostName ?? null,
    metadata: input.metadata ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });

  await sendExpoPush(
    recipients.map((r) => r.token).filter((token): token is string => Boolean(token)),
    input.title,
    input.body,
    {
      type: `admin_${input.type}`,
      adminNotificationId: ref.id,
      ...(input.orderId ? {orderId: input.orderId} : {}),
      ...(input.reportId ? {reportId: input.reportId} : {}),
      ...(input.userId ? {userId: input.userId} : {}),
      ...(input.paymentId ? {paymentId: input.paymentId} : {}),
    },
  );

  logger.info("[admin-notification] sent", {
    notificationId: ref.id,
    type: input.type,
    sentToCount: sentTo.length,
    pushTokenCount: recipients.filter((r) => r.token).length,
  });
}

export const notifyAdminsOnOrderCreated = onDocumentCreated(
  {document: "orders/{orderId}", region: "us-central1"},
  async (event) => {
    const order = event.data?.data() ?? {};
    const orderId = event.params.orderId;
    const restaurantName =
      str(order.restaurantName) ||
      (order.restaurant && typeof order.restaurant === "object" ?
        str((order.restaurant as Record<string, unknown>).name) :
        "");
    const hostName =
      str(order.hostName) ||
      str(order.customerName) ||
      (order.customer && typeof order.customer === "object" ?
        str((order.customer as Record<string, unknown>).name) :
        "");

    await createAdminNotification({
      type: "new_order_created",
      title: "New Order Created",
      body: "A new order was created and requires monitoring.",
      orderId,
      restaurantName: restaurantName || null,
      hostName: hostName || null,
      metadata: {
        orderId,
        restaurantName: restaurantName || null,
        hostName: hostName || null,
        createdAt: order.createdAt ?? null,
      },
    });
  },
);

export const notifyAdminsOnReportCreated = onDocumentCreated(
  {document: "reports/{reportId}", region: "us-central1"},
  async (event) => {
    const report = event.data?.data() ?? {};
    await createAdminNotification({
      type: "new_report_submitted",
      title: "New Report Submitted",
      body: "A new user report requires admin review.",
      reportId: event.params.reportId,
      orderId: str(report.orderId) || null,
      userId: str(report.reportedUid) || str(report.reportedUserId) || null,
      metadata: {
        reason: report.reason ?? null,
        source: report.source ?? null,
      },
    });
  },
);

export const notifyAdminsOnPaymentIssue = onDocumentWritten(
  {document: "payments/{paymentId}", region: "us-central1"},
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() ?? {} : {};
    const after = event.data?.after.exists ? event.data.after.data() ?? {} : null;
    if (!after) return;
    const beforeStatus = str(before.status || before.paymentStatus).toLowerCase();
    const status = str(after.status || after.paymentStatus).toLowerCase();
    if (!status || status === beforeStatus) return;

    if (["failed", "payment_failed"].includes(status)) {
      await createAdminNotification({
        type: "payment_failure",
        title: "Payment Failure",
        body: "A payment failed and may need follow-up.",
        paymentId: event.params.paymentId,
        orderId: str(after.orderId) || str(after.matchId) || null,
        userId: str(after.userId) || null,
        metadata: {status},
      });
    }

    if (["refunded", "refund_requested", "chargeback", "disputed"].includes(status)) {
      await createAdminNotification({
        type: "chargeback_refund_request",
        title: "Chargeback / Refund Request",
        body: "A refund or chargeback event requires review.",
        paymentId: event.params.paymentId,
        orderId: str(after.orderId) || str(after.matchId) || null,
        userId: str(after.userId) || null,
        metadata: {status},
      });
    }
  },
);

export const notifyAdminsOnUserSuspended = onDocumentUpdated(
  {document: "users/{uid}", region: "us-central1"},
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    const wasSuspended = before.suspended === true || before.restricted === true;
    const isSuspended = after.suspended === true || after.restricted === true;
    if (!isSuspended || wasSuspended) return;

    await createAdminNotification({
      type: "user_suspended",
      title: "User Suspended",
      body: "A user account was suspended by moderation.",
      userId: event.params.uid,
    });
  },
);

export const notifyAdminsOnHighRiskModeration = onDocumentCreated(
  {document: "moderationAuditLog/{eventId}", region: "us-central1"},
  async (event) => {
    const data = event.data?.data() ?? {};
    const action = str(data.action);
    if (!["chat_account_review_flag", "chat_temporary_restriction", "admin_suspend"].includes(action)) {
      return;
    }
    await createAdminNotification({
      type: "high_risk_moderation",
      title: "High Risk Moderation Event",
      body: "A high-risk moderation event requires admin review.",
      moderationEventId: event.params.eventId,
      userId: str(data.actorUid) || str(data.targetUid) || null,
      reportId: str(data.reportId) || null,
      metadata: {action},
    });
  },
);

export const notifyAdminsOnFlaggedMessage = onDocumentCreated(
  {document: "flaggedMessages/{messageId}", region: "us-central1"},
  async (event) => {
    const data = event.data?.data() ?? {};
    await createAdminNotification({
      type: "flagged_chat_message",
      title: "Flagged Chat Message",
      body: "A chat message was blocked by moderation.",
      flaggedMessageId: event.params.messageId,
      userId: str(data.senderUid) || str(data.reporterUid) || null,
      metadata: {
        category: data.category ?? null,
        matchId: data.matchId ?? null,
        matchChatId: data.matchChatId ?? null,
      },
    });
  },
);
