/**
 * Restaurant new-order push (Uber Eats–style system notification).
 *
 * Fires once when an order first becomes kitchen-actionable for the restaurant
 * (paid + awaiting restaurant). Never re-notifies on later status changes.
 */
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPT_COLLECTION = "restaurantNewOrderPushes";

/** Statuses that mean the kitchen has already moved past “new order”. */
const POST_NEW_ORDER_STATUSES = new Set([
  "accepted",
  "restaurant_accepted",
  "preparing",
  "ready",
  "ready_for_pickup",
  "pending_driver",
  "driver_accepted",
  "driver_assigned",
  "arriving_restaurant",
  "picked_up_pending",
  "picked_up",
  "on_the_way",
  "arrived_customer",
  "delivered",
  "completed",
  "cancelled",
  "rejected",
]);

const PRE_PAYMENT_STATUSES = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
]);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return str(value).toLowerCase();
}

function isPaid(data: Record<string, unknown>): boolean {
  const payment = lower(data.paymentStatus);
  return payment === "paid" || payment === "succeeded";
}

/**
 * Order is a brand-new kitchen assignment (restaurant must Accept).
 */
function isRestaurantNewOrder(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.archivedByRestaurant === true || data.hiddenForRestaurant === true) {
    return false;
  }
  if (!isPaid(data)) return false;

  const status = lower(data.status);
  if (!status) return false;
  if (PRE_PAYMENT_STATUSES.has(status)) return false;
  if (POST_NEW_ORDER_STATUSES.has(status)) return false;

  // Canonical post-payment kitchen queue statuses.
  return (
    status === "payment_confirmed" ||
    status === "pending" ||
    status === "confirmed"
  );
}

function restaurantIdOf(data: Record<string, unknown>): string {
  return str(data.restaurantId) || str(data.venueId);
}

function restaurantNameOf(data: Record<string, unknown>): string {
  const nested =
    data.restaurant && typeof data.restaurant === "object"
      ? str((data.restaurant as Record<string, unknown>).name)
      : "";
  return str(data.restaurantName) || nested || "Restaurant";
}

function itemCountOf(data: Record<string, unknown>): number {
  const items = data.items;
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum: number, item: unknown) => {
    if (!item || typeof item !== "object") return sum + 1;
    const qty = (item as Record<string, unknown>).qty;
    const n = typeof qty === "number" && Number.isFinite(qty) ? qty : 1;
    return sum + Math.max(1, Math.round(n));
  }, 0);
}

function totalLabelOf(data: Record<string, unknown>): string {
  const raw =
    typeof data.totalPrice === "number"
      ? data.totalPrice
      : typeof data.total === "number"
        ? data.total
        : typeof data.customerTotal === "number"
          ? data.customerTotal
          : 0;
  const amount = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  return `$${amount.toFixed(2)}`;
}

async function expoTokenForRestaurant(restaurantId: string): Promise<string | null> {
  const userSnap = await db.doc(`users/${restaurantId}`).get();
  const row = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const token = str(row[key]);
    if (token) return token;
  }
  const tokenSnap = await db.doc(`users/${restaurantId}/pushToken/default`).get();
  const token = tokenSnap.exists ? str(tokenSnap.data()?.token) : "";
  return token || null;
}

async function countAwaitingRestaurantOrders(restaurantId: string): Promise<number> {
  try {
    const snap = await db
      .collection("orders")
      .where("restaurantId", "==", restaurantId)
      .where("paymentStatus", "==", "paid")
      .where("status", "==", "payment_confirmed")
      .limit(40)
      .get();
    return Math.max(1, snap.size);
  } catch {
    return 1;
  }
}

async function claimPushReceipt(orderId: string, restaurantId: string): Promise<boolean> {
  const ref = db.collection(RECEIPT_COLLECTION).doc(orderId);
  try {
    await ref.create({
      orderId,
      restaurantId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as {code?: unknown}).code)
        : "";
    // Already claimed (dedupe / retry).
    if (code === "6" || code === "already-exists" || /ALREADY_EXISTS/i.test(String(error))) {
      return false;
    }
    logger.warn("[restaurant-new-order] receipt_create_failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail closed on unknown errors to avoid duplicate spam on retries.
    return false;
  }
}

async function sendRestaurantNewOrderPush(input: {
  token: string;
  orderId: string;
  restaurantName: string;
  itemCount: number;
  totalLabel: string;
  badge: number;
}): Promise<void> {
  const itemLabel = input.itemCount === 1 ? "1 item" : `${input.itemCount} items`;
  const body =
    `${input.restaurantName} • ${itemLabel} • ${input.totalLabel}\n` +
    "Tap to accept the order.";

  // Deep link lands on the restaurant Orders tab kitchen queue.
  const deepLink =
    `/(host)/orders?focusOrderId=${encodeURIComponent(input.orderId)}`;

  const res = await fetch(EXPO_PUSH_SEND_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        to: input.token,
        title: "New Order Received",
        body,
        sound: "order_critical_alert.wav",
        priority: "high",
        channelId: "critical_orders",
        badge: input.badge,
        data: {
          type: "restaurant_new_order",
          orderId: input.orderId,
          role: "restaurant",
          event: "new_order",
          deepLink,
        },
      },
    ]),
  });

  // Parse Expo ticket so token failures are visible in Cloud logs.
  try {
    const text = await res.text();
    logger.info("[restaurant-new-order] expo_response", {
      orderId: input.orderId,
      httpStatus: res.status,
      body: text.slice(0, 500),
    });
  } catch {
    /* ignore */
  }
}

export const notifyRestaurantOnNewOrder = onDocumentWritten(
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
    if (isRestaurantNewOrder(before)) return;
    if (!isRestaurantNewOrder(after)) return;

    const restaurantId = restaurantIdOf(after);
    if (!restaurantId) {
      logger.warn("[restaurant-new-order] missing_restaurantId", {orderId});
      return;
    }

    const claimed = await claimPushReceipt(orderId, restaurantId);
    if (!claimed) {
      logger.info("[restaurant-new-order] deduped", {orderId, restaurantId});
      return;
    }

    const token = await expoTokenForRestaurant(restaurantId);
    if (!token) {
      // Allow a later retry if the restaurant registers a token and the order is touched again.
      await db.collection(RECEIPT_COLLECTION).doc(orderId).delete().catch(() => undefined);
      logger.info("[restaurant-new-order] no_push_token", {orderId, restaurantId});
      return;
    }

    const badge = await countAwaitingRestaurantOrders(restaurantId);
    const restaurantName = restaurantNameOf(after);
    const itemCount = itemCountOf(after);
    const totalLabel = totalLabelOf(after);

    try {
      await sendRestaurantNewOrderPush({
        token,
        orderId,
        restaurantName,
        itemCount,
        totalLabel,
        badge,
      });
      logger.info("[restaurant-new-order] sent", {
        orderId,
        restaurantId,
        itemCount,
        totalLabel,
        badge,
      });
    } catch (error) {
      await db.collection(RECEIPT_COLLECTION).doc(orderId).delete().catch(() => undefined);
      logger.error("[restaurant-new-order] push_failed", {
        orderId,
        restaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
