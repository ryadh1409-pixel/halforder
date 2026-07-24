import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentCreated, onDocumentWritten} from "firebase-functions/v2/firestore";

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => str(v)).filter(Boolean))];
}

function driverUid(data: Record<string, unknown>): string {
  return str(data.driverId) || str(data.assignedDriverId);
}

function orderCustomerUids(data: Record<string, unknown>): string[] {
  const participantIds = Array.isArray(data.participantIds) ?
    data.participantIds.filter((uid): uid is string => typeof uid === "string") :
    [];
  const users = Array.isArray(data.users) ?
    data.users.filter((uid): uid is string => typeof uid === "string") :
    [];
  return unique([
    ...participantIds,
    ...users,
    str(data.userId),
    str(data.customerId),
    str(data.customerUid),
    str(data.createdBy),
    str(data.creatorId),
    str(data.hostId),
    str(data.pickupUserId),
    str(data.dropoffUserId),
  ]);
}

async function expoTokenFor(uid: string): Promise<string | null> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() ?? {};
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const token = str(user[key]);
    if (token) return token;
  }
  const tokenSnap = await db.doc(`users/${uid}/pushToken/default`).get();
  if (tokenSnap.exists) {
    const token = str(tokenSnap.data()?.token);
    if (token) return token;
  }
  const fcmSnap = await db.doc(`users/${uid}/fcmToken/default`).get();
  return fcmSnap.exists ? str(fcmSnap.data()?.token) || null : null;
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
    logger.warn("[order-chat] push_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const provisionDriverChatOnAssignment = onDocumentWritten(
  {document: "orders/{orderId}", region: "us-central1"},
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() ?? {} : {};
    const after = event.data?.after.exists ? event.data.after.data() ?? {} : null;
    if (!after) return;

    const previousDriver = driverUid(before);
    const nextDriver = driverUid(after);
    if (!nextDriver || previousDriver === nextDriver) return;

    const customerUids = orderCustomerUids(after).filter((uid) => uid !== nextDriver);
    if (customerUids.length === 0) return;

    const orderId = event.params.orderId;
    const orderRef = db.doc(`orders/${orderId}`);
    const welcomeRef = orderRef.collection("messages").doc("driver-chat-welcome");
    await db.runTransaction(async (tx) => {
      tx.set(orderRef, {
        driverChatEnabled: true,
        driverChatEnabledAt: FieldValue.serverTimestamp(),
        driverChatType: "customer_driver",
        driverChatParticipantIds: unique([...customerUids, nextDriver]),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      tx.set(welcomeRef, {
        text: "Driver assigned. You can now coordinate delivery here.",
        chatType: "customer_driver",
        senderId: "system",
        senderUid: "system",
        senderRole: "system",
        senderName: "HalfOrder",
        createdAt: FieldValue.serverTimestamp(),
        sentAt: FieldValue.serverTimestamp(),
        deliveredAt: null,
        readAt: null,
        system: true,
      }, {merge: false});
    }).catch(async (error) => {
      if (String(error).includes("ALREADY_EXISTS")) {
        await orderRef.set({
          driverChatEnabled: true,
          driverChatEnabledAt: FieldValue.serverTimestamp(),
          driverChatType: "customer_driver",
          driverChatParticipantIds: unique([...customerUids, nextDriver]),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
        return;
      }
      throw error;
    });

    logger.info("[order-chat] driver_chat_enabled", {
      orderId,
      driverId: nextDriver,
      customerCount: customerUids.length,
    });
  },
);

export const notifyOrderChatMessageCreated = onDocumentCreated(
  {document: "orders/{orderId}/messages/{messageId}", region: "us-central1"},
  async (event) => {
    const message = event.data?.data() ?? {};
    const chatType = str(message.chatType) || "customer_driver";
    if (chatType !== "customer_driver" && chatType !== "restaurant_driver") return;
    const senderId = str(message.senderUid) || str(message.senderId);
    if (!senderId || senderId === "system") return;

    const orderId = event.params.orderId;
    const orderSnap = await db.doc(`orders/${orderId}`).get();
    if (!orderSnap.exists) return;
    const order = orderSnap.data() ?? {};
    const driver = driverUid(order);
    const customerUids = orderCustomerUids(order);
    const recipients = unique(
      chatType === "customer_driver" ?
        [...customerUids, driver].filter((uid) => uid !== senderId) :
        [driver, str(order.restaurantId), str(order.venueId)].filter((uid) => uid !== senderId),
    );
    const tokens = (
      await Promise.all(recipients.map((uid) => expoTokenFor(uid)))
    ).filter((token): token is string => Boolean(token));
    const senderRole = str(message.senderRole).toLowerCase();
    const senderName = str(message.senderName) ||
      (senderRole === "driver" ? "Driver" :
        senderRole === "restaurant" ? "Restaurant" :
          "Customer");
    const body = str(message.text).slice(0, 120) || "New chat message";
    // Title = sender name; body = message preview (driver sees these immediately).
    await sendExpoPush(tokens, senderName, body, {
      type: "order_chat_message",
      orderId,
      messageId: event.params.messageId,
      chatType,
    });
  },
);
