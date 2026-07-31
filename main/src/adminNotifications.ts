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
  options?: {badge?: number; channelId?: string},
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
        channelId: options?.channelId ?? "halforder",
        ...(typeof options?.badge === "number" ? {badge: options.badge} : {}),
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
  deepLink?: string | null;
  badge?: number;
  channelId?: string;
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

  const deepLink =
    input.deepLink ||
    (input.orderId ? `/(tabs)/admin/order/${encodeURIComponent(input.orderId)}` : "");

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
      ...(deepLink ? {deepLink} : {}),
    },
    {
      badge: input.badge,
      channelId: input.channelId,
    },
  );

  logger.info("[admin-notification] sent", {
    notificationId: ref.id,
    type: input.type,
    sentToCount: sentTo.length,
    pushTokenCount: recipients.filter((r) => r.token).length,
  });
}

function isPaid(data: Record<string, unknown>): boolean {
  const payment = str(data.paymentStatus).toLowerCase();
  return payment === "paid" || payment === "succeeded";
}

function restaurantNameOf(order: Record<string, unknown>): string {
  const nested =
    order.restaurant && typeof order.restaurant === "object"
      ? str((order.restaurant as Record<string, unknown>).name)
      : "";
  return str(order.restaurantName) || nested || "Restaurant";
}

function itemCountOf(order: Record<string, unknown>): number {
  const items = order.items;
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum: number, item: unknown) => {
    if (!item || typeof item !== "object") return sum + 1;
    const qty = (item as Record<string, unknown>).qty;
    const n = typeof qty === "number" && Number.isFinite(qty) ? qty : 1;
    return sum + Math.max(1, Math.round(n));
  }, 0);
}

function totalLabelOf(order: Record<string, unknown>): string {
  const raw =
    typeof order.totalPrice === "number"
      ? order.totalPrice
      : typeof order.total === "number"
        ? order.total
        : typeof order.customerTotal === "number"
          ? order.customerTotal
          : 0;
  const amount = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  return `$${amount.toFixed(2)}`;
}

async function claimAdminPaidOrderPush(orderId: string): Promise<boolean> {
  const ref = db.collection("adminPaidOrderPushes").doc(orderId);
  try {
    await ref.create({
      orderId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as {code?: unknown}).code)
        : "";
    if (code === "6" || code === "already-exists" || /ALREADY_EXISTS/i.test(String(error))) {
      return false;
    }
    logger.warn("[admin-paid-order] receipt_create_failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function countUnreadAdminNotifications(): Promise<number> {
  try {
    const snap = await db.collection("admin_notifications").orderBy("createdAt", "desc").limit(80).get();
    let unread = 0;
    snap.docs.forEach((docSnap) => {
      const readBy = docSnap.data()?.readBy;
      if (!Array.isArray(readBy) || readBy.length === 0) unread += 1;
    });
    return Math.max(1, unread);
  } catch {
    return 1;
  }
}

/**
 * Notify all admins once when a customer payment succeeds (paid order).
 * Replaces create-time spam with a single paid-order push.
 */
export const notifyAdminsOnOrderCreated = onDocumentWritten(
  {document: "orders/{orderId}", region: "us-central1"},
  async (event) => {
    const orderId = event.params.orderId;
    const before = event.data?.before.exists
      ? (event.data.before.data() as Record<string, unknown>)
      : null;
    const after = event.data?.after.exists
      ? (event.data.after.data() as Record<string, unknown>)
      : null;
    if (!after) return;

    const becamePaid = !isPaid(before ?? {}) && isPaid(after);
    if (!becamePaid) return;

    const claimed = await claimAdminPaidOrderPush(orderId);
    if (!claimed) {
      logger.info("[admin-paid-order] deduped", {orderId});
      return;
    }

    const restaurantName = restaurantNameOf(after);
    const itemCount = itemCountOf(after);
    const totalLabel = totalLabelOf(after);
    const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;
    const body =
      `${restaurantName} • ${itemLabel} • ${totalLabel}\n` +
      "Customer payment completed.";
    const hostName =
      str(after.hostName) ||
      str(after.customerName) ||
      (after.customer && typeof after.customer === "object"
        ? str((after.customer as Record<string, unknown>).name)
        : "");
    const badge = await countUnreadAdminNotifications();

    await createAdminNotification({
      type: "new_order_created",
      title: "New Paid Order",
      body,
      orderId,
      restaurantName: restaurantName || null,
      hostName: hostName || null,
      deepLink: `/(tabs)/admin/dashboard?focusOrderId=${encodeURIComponent(orderId)}`,
      badge,
      channelId: "halforder",
      metadata: {
        orderId,
        restaurantName: restaurantName || null,
        hostName: hostName || null,
        paidAt: after.paidAt ?? null,
        event: "payment_completed",
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
