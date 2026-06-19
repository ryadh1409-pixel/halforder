import {getFirestore, Timestamp, WriteBatch} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onSchedule} from "firebase-functions/v2/scheduler";

const db = getFirestore();
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = ["completed", "delivered", "cancelled", "expired"];
const TERMINAL_MATCH_LIFECYCLES = ["COMPLETED", "DELIVERED", "CANCELLED"];

function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as {toMillis?: () => number}).toMillis === "function") {
    return (value as {toMillis: () => number}).toMillis();
  }
  return null;
}

function terminalAgeMs(data: Record<string, unknown>): number | null {
  return (
    toMillis(data.completedAt) ??
    toMillis(data.cancelledAt) ??
    toMillis(data.expiredAt) ??
    toMillis(data.updatedAt) ??
    toMillis(data.createdAt)
  );
}

async function deleteQueryDocs(
  batch: WriteBatch,
  query: FirebaseFirestore.Query,
): Promise<number> {
  const snap = await query.limit(200).get();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  return snap.size;
}

async function cleanupOrder(orderId: string): Promise<{
  messages: number;
  notifications: number;
  inboxNotifications: number;
  reports: number;
}> {
  const batch = db.batch();
  const orderRef = db.collection("orders").doc(orderId);
  const [messages, notifications, inboxNotifications, reportsByOrder, reportsByContent] =
    await Promise.all([
      deleteQueryDocs(batch, orderRef.collection("messages")),
      deleteQueryDocs(
        batch,
        db.collection("notifications").where("orderId", "==", orderId),
      ),
      deleteQueryDocs(
        batch,
        db.collectionGroup("inboxNotifications").where("orderId", "==", orderId),
      ),
      deleteQueryDocs(batch, db.collection("reports").where("orderId", "==", orderId)),
      deleteQueryDocs(
        batch,
        db.collection("reports").where("contentId", "==", `order:${orderId}`),
      ),
    ]);

  batch.delete(orderRef);
  await batch.commit();

  return {
    messages,
    notifications,
    inboxNotifications,
    reports: reportsByOrder + reportsByContent,
  };
}

async function cleanupTerminalOrders(): Promise<number> {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let deleted = 0;

  for (const status of TERMINAL_STATUSES) {
    const snap = await db
      .collection("orders")
      .where("status", "==", status)
      .limit(200)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const ageMs = terminalAgeMs(data);
      if (ageMs == null || ageMs > cutoff) continue;
      const result = await cleanupOrder(doc.id);
      deleted++;
      logger.info("[order-retention-cleanup] order_deleted", {
        orderId: doc.id,
        status,
        ...result,
      });
    }
  }

  return deleted;
}

async function cleanupPartnerChat(matchId: string, data: Record<string, unknown>): Promise<number> {
  const matchChatId =
    typeof data.matchChatId === "string" && data.matchChatId.trim()
      ? data.matchChatId.trim()
      : matchId;
  const chatRef = db.collection("matchChats").doc(matchChatId);
  const batch = db.batch();
  const messages = await deleteQueryDocs(batch, chatRef.collection("matchMessages"));
  batch.delete(chatRef);
  batch.set(db.collection("matches").doc(matchId), {
    partnerChatDeletedAt: Timestamp.now(),
  }, {merge: true});
  await batch.commit();
  logger.info("[order-retention-cleanup] partner_chat_deleted", {
    matchId,
    matchChatId,
    messages,
  });
  return 1;
}

async function cleanupTerminalPartnerChats(): Promise<number> {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let deleted = 0;

  for (const lifecycle of TERMINAL_MATCH_LIFECYCLES) {
    const snap = await db
      .collection("matches")
      .where("lifecycle", "==", lifecycle)
      .limit(200)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.partnerChatDeletedAt != null) continue;
      const ageMs = terminalAgeMs(data);
      if (ageMs == null || ageMs > cutoff) continue;
      deleted += await cleanupPartnerChat(doc.id, data);
    }
  }

  return deleted;
}

export const cleanupOldTerminalOrders = onSchedule(
  {
    schedule: "every day 04:30",
    timeZone: "UTC",
    retryCount: 1,
  },
  async () => {
    const started = Date.now();
    const deletedOrders = await cleanupTerminalOrders();
    const deletedPartnerChats = await cleanupTerminalPartnerChats();
    logger.info("[order-retention-cleanup] complete", {
      deletedOrders,
      deletedPartnerChats,
      durationMs: Date.now() - started,
    });
  },
);
