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

  logger.info("[order-paid-repair] triggered", {orderId, before});

  const patch = buildOrderPaidStatePatch(data, {repairOnly: true});
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
