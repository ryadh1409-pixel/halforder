import {FieldValue, getFirestore, type DocumentData} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  buildOrderPaidStatePatch,
  needsPaidStatusRepair,
  orderPaymentStatusString,
  orderStatusString,
} from "./orderPaidState.js";

const db = getFirestore();

/**
 * Repairs split state: paymentStatus paid + status still awaiting_payment.
 * Idempotent — no-op when already consistent.
 */
export async function repairOrderPaidStateIfNeeded(
  orderId: string,
  data: DocumentData,
): Promise<boolean> {
  if (!needsPaidStatusRepair(data)) {
    return false;
  }

  const before = {
    paymentStatus: orderPaymentStatusString(data.paymentStatus),
    status: orderStatusString(data.status),
  };

  const courier = orderStatusString(data.deliveryStatus).toLowerCase();
  const kitchen = orderStatusString(data.status).toLowerCase();
  const fulfillmentAdvanced =
    kitchen === "accepted" ||
    kitchen === "restaurant_accepted" ||
    kitchen === "preparing" ||
    kitchen === "ready" ||
    kitchen === "ready_for_pickup" ||
    courier === "accepted" ||
    courier === "preparing" ||
    courier === "ready_for_pickup" ||
    courier === "driver_assigned" ||
    courier === "picked_up" ||
    courier === "delivered";

  if (fulfillmentAdvanced) {
    logger.info("[order-paid-repair] skipped_fulfillment_advanced", {orderId, before});
    return false;
  }

  logger.info("[order-paid-repair] triggered", {orderId, before});

  const freshSnap = await db.doc(`orders/${orderId}`).get();
  if (!freshSnap.exists) return false;
  const fresh = freshSnap.data() ?? {};

  const patch = buildOrderPaidStatePatch(fresh, {repairOnly: true});
  if (Object.keys(patch).length === 0) {
    logger.info("[order-paid-repair] skipped_empty_patch", {orderId});
    return false;
  }

  console.log("[ORDER WRITE TRACE]", "repairOrderPaidState.ts", "repairOrderPaidStateIfNeeded", {
    orderId,
    status: patch.status ?? null,
    deliveryStatus: patch.deliveryStatus ?? null,
    paymentStatus: patch.paymentStatus ?? null,
    op: "update",
    merge: null,
  });

  await db.doc(`orders/${orderId}`).update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  });

  logger.info("[order-paid-repair] applied", {
    orderId,
    before,
    after: {
      paymentStatus: patch.paymentStatus,
      status: patch.status,
    },
  });

  return true;
}
