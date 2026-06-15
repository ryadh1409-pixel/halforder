import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";

const db = getFirestore();
const TX_COLLECTION = "paymentTransactions";
const AUDIT_COLLECTION = "paymentAuditLogs";

async function appendPaymentAuditLog(input: {
  paymentTransactionId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.collection(AUDIT_COLLECTION).add({
    paymentTransactionId: input.paymentTransactionId,
    action: input.action,
    actor: input.actor,
    details: input.details ?? {},
    timestamp: FieldValue.serverTimestamp(),
  });
}

async function linkDriverToPaymentTransactions(input: {
  orderId: string;
  driverId: string;
  driverName: string | null;
}): Promise<void> {
  const byOrder = await db
    .collection(TX_COLLECTION)
    .where("orderId", "==", input.orderId)
    .get();
  const byMatch = await db
    .collection(TX_COLLECTION)
    .where("matchId", "==", input.orderId)
    .get();
  const docs = [...byOrder.docs, ...byMatch.docs];
  if (docs.length === 0) return;

  await Promise.all(
    docs.map(async (docSnap) => {
      await docSnap.ref.set(
        {
          driverId: input.driverId,
          driverName: input.driverName,
          orderId: input.orderId,
          updatedAt: FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      await appendPaymentAuditLog({
        paymentTransactionId: docSnap.id,
        action: "driver_assigned",
        actor: input.driverId,
        details: {orderId: input.orderId, driverName: input.driverName},
      });
    }),
  );
}

async function markPaymentTransactionsCompleted(orderId: string): Promise<void> {
  const byOrder = await db
    .collection(TX_COLLECTION)
    .where("orderId", "==", orderId)
    .get();
  const byMatch = await db
    .collection(TX_COLLECTION)
    .where("matchId", "==", orderId)
    .get();
  const docs = [...byOrder.docs, ...byMatch.docs];
  await Promise.all(
    docs.map(async (docSnap) => {
      await appendPaymentAuditLog({
        paymentTransactionId: docSnap.id,
        action: "completed",
        actor: "system",
        details: {orderId},
      });
    }),
  );
}

/** Links driver assignment on orders to paymentTransactions + audit log. */
export const linkPaymentTransactionDriver = onDocumentUpdated(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const orderId = event.params.orderId;
    const prevDriver =
      typeof before.driverId === "string"
        ? before.driverId
        : typeof before.assignedDriverId === "string"
          ? before.assignedDriverId
          : "";
    const nextDriver =
      typeof after.driverId === "string"
        ? after.driverId
        : typeof after.assignedDriverId === "string"
          ? after.assignedDriverId
          : "";
    if (!nextDriver || nextDriver === prevDriver) return;

    const driverName =
      typeof after.driverName === "string" ? after.driverName : null;
    try {
      await linkDriverToPaymentTransactions({
        orderId,
        driverId: nextDriver,
        driverName,
      });
      logger.info("[PAYMENT TRANSACTION DRIVER LINK]", {
        orderId,
        driverId: nextDriver,
      });
    } catch (err) {
      logger.error("[PAYMENT TRANSACTION DRIVER LINK ERROR]", {
        orderId,
        driverId: nextDriver,
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const deliveryStatus = String(after.deliveryStatus ?? "").toLowerCase();
    const status = String(after.status ?? "").toLowerCase();
    if (
      deliveryStatus === "delivered" ||
      deliveryStatus === "completed" ||
      status === "delivered" ||
      status === "completed"
    ) {
      try {
        await markPaymentTransactionsCompleted(orderId);
      } catch (err) {
        logger.error("[PAYMENT TRANSACTION COMPLETE ERROR]", {
          orderId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);
