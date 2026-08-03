/**
 * Driver ready-for-pickup push (Uber Driver–style).
 *
 * Fires once when an order first becomes ready_for_pickup and a driver is
 * assigned. Pool (unassigned) ready orders are handled by the driver hub
 * client critical-alert path.
 */
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

const db = getFirestore();
const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPT_COLLECTION = "driverReadyForPickupPushes";
const SOUND = "order_critical_alert.wav";
const CHANNEL = "critical_orders";

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return str(value).toLowerCase();
}

function isReadyForPickup(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const status = lower(data.status);
  const courier = lower(data.deliveryStatus);
  return status === "ready_for_pickup" || courier === "ready_for_pickup";
}

function driverIdOf(data: Record<string, unknown>): string {
  return str(data.driverId) || str(data.assignedDriverId);
}

function restaurantNameOf(data: Record<string, unknown>): string {
  const nested =
    data.restaurant && typeof data.restaurant === "object"
      ? str((data.restaurant as Record<string, unknown>).name)
      : "";
  return str(data.restaurantName) || nested || "Restaurant";
}

async function expoTokenForDriver(driverId: string): Promise<string | null> {
  const userSnap = await db.doc(`users/${driverId}`).get();
  const row = (userSnap.exists ? userSnap.data() : {}) as Record<string, unknown>;
  for (const key of ["expoPushToken", "pushToken", "fcmToken"]) {
    const token = str(row[key]);
    if (token) return token;
  }
  const tokenSnap = await db.doc(`users/${driverId}/pushToken/default`).get();
  const token = tokenSnap.exists ? str(tokenSnap.data()?.token) : "";
  return token || null;
}

async function claimReceipt(orderId: string, driverId: string): Promise<boolean> {
  const ref = db.collection(RECEIPT_COLLECTION).doc(orderId);
  try {
    await ref.create({
      orderId,
      driverId,
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
    logger.warn("[driver-ready] receipt_create_failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function sendDriverReadyPush(input: {
  token: string;
  orderId: string;
  restaurantName: string;
}): Promise<Response> {
  const deepLink = `/(driver)/active/${encodeURIComponent(input.orderId)}`;
  return fetch(EXPO_PUSH_SEND_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        to: input.token,
        title: "Order Ready for Pickup",
        body: `${input.restaurantName} marked an order ready.\nOpen to continue.`,
        sound: SOUND,
        priority: "high",
        channelId: CHANNEL,
        data: {
          type: "driver_ready_for_pickup",
          orderId: input.orderId,
          role: "driver",
          event: "ready_for_pickup",
          deepLink,
        },
      },
    ]),
  });
}

export const notifyDriverOnReadyForPickup = onDocumentWritten(
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
    if (isReadyForPickup(before)) return;
    if (!isReadyForPickup(after)) return;

    const driverId = driverIdOf(after);
    if (!driverId) {
      logger.info("[driver-ready] no_assigned_driver", {orderId});
      return;
    }

    const claimed = await claimReceipt(orderId, driverId);
    if (!claimed) {
      logger.info("[driver-ready] deduped", {orderId, driverId});
      return;
    }

    const token = await expoTokenForDriver(driverId);
    if (!token) {
      await db.collection(RECEIPT_COLLECTION).doc(orderId).delete().catch(() => undefined);
      logger.info("[driver-ready] no_push_token", {orderId, driverId});
      return;
    }

    try {
      const res = await sendDriverReadyPush({
        token,
        orderId,
        restaurantName: restaurantNameOf(after),
      });
      const text = await res.text().catch(() => "");
      logger.info("[driver-ready] sent", {
        orderId,
        driverId,
        httpStatus: res.status,
        expoBody: text.slice(0, 400),
      });
      if (!res.ok) {
        await db.collection(RECEIPT_COLLECTION).doc(orderId).delete().catch(() => undefined);
      }
    } catch (error) {
      await db.collection(RECEIPT_COLLECTION).doc(orderId).delete().catch(() => undefined);
      logger.error("[driver-ready] push_failed", {
        orderId,
        driverId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
