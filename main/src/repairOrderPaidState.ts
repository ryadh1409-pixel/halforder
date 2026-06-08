import {FieldValue, getFirestore, type DocumentData} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  buildOrderPaidStatePatch,
  isOrderFulfilledForPaidPatch,
  needsPaidStatusRepair,
  orderPaymentStatusString,
  orderStatusString,
  shouldBlockStripePaymentOverwrite,
} from "./orderPaidState.js";
import {isDriverFulfillmentAdvanced} from "./driverFulfillmentGuard.js";
import {hasFulfillmentProgressMarkers} from "./orderFulfillmentSignals.js";
import {prepareServerOrderPatch} from "./serverOrderWrite.js";

const db = getFirestore();

/**
 * Repairs split state: paymentStatus paid + status still awaiting_payment.
 * Idempotent — no-op when already consistent. Never downgrades fulfillment.
 */
export async function repairOrderPaidStateIfNeeded(
  orderId: string,
  data: DocumentData,
): Promise<boolean> {
  if (shouldBlockStripePaymentOverwrite(data)) {
    console.log("[repairOrderPaidState] BLOCKED - order already fulfilled, skipping write", {
      orderId,
      currentStatus: data.status ?? null,
      currentDeliveryStatus: data.deliveryStatus ?? null,
    });
    return false;
  }

  if (isDriverFulfillmentAdvanced(data.deliveryStatus)) {
    console.log(
      "[FUNCTION] skipping — driver already advanced:",
      data.deliveryStatus,
      {orderId, logSource: "repairOrderPaidState"},
    );
    return false;
  }

  if (hasFulfillmentProgressMarkers(data) || isOrderFulfilledForPaidPatch(data)) {
    console.log(
      "[REPAIR] skipping — order already fulfilled:",
      orderStatusString(data.status),
      {orderId},
    );
    return false;
  }

  if (!needsPaidStatusRepair(data)) {
    return false;
  }

  const before = {
    paymentStatus: orderPaymentStatusString(data.paymentStatus),
    status: orderStatusString(data.status),
  };

  logger.info("[order-paid-repair] triggered", {orderId, before});

  const orderRef = db.doc(`orders/${orderId}`);
  let applied = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;

    const fresh = snap.data() ?? {};
    if (shouldBlockStripePaymentOverwrite(fresh)) {
      console.log("[repairOrderPaidState] BLOCKED - order already fulfilled, skipping write", {
        orderId,
        currentStatus: fresh.status ?? null,
        currentDeliveryStatus: fresh.deliveryStatus ?? null,
        logSource: "repairOrderPaidState:txn",
      });
      return;
    }
    if (isDriverFulfillmentAdvanced(fresh.deliveryStatus)) {
      console.log(
        "[FUNCTION] skipping — driver already advanced:",
        fresh.deliveryStatus,
        {orderId, logSource: "repairOrderPaidState:txn"},
      );
      return;
    }
    if (hasFulfillmentProgressMarkers(fresh) || isOrderFulfilledForPaidPatch(fresh)) {
      console.log("[REPAIR] txn skip — fulfilled", {orderId});
      return;
    }
    if (!needsPaidStatusRepair(fresh)) {
      return;
    }

    const basePatch = buildOrderPaidStatePatch(fresh, {repairOnly: true});
    const safePatch = prepareServerOrderPatch(
      orderId,
      fresh,
      {
        ...basePatch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      "repairOrderPaidState",
    );

    const lifecycleKeys = ["status", "deliveryStatus", "paymentStatus"];
    const hasLifecycleWrite = lifecycleKeys.some((k) => safePatch[k] !== undefined);
    if (!hasLifecycleWrite && safePatch.paymentStatus === undefined) {
      logger.info("[order-paid-repair] skipped_empty_patch", {orderId});
      return;
    }

    console.log("[STATUS WRITE]", {
      orderId,
      previousStatus: fresh.status ?? null,
      newStatus: safePatch.status ?? fresh.status ?? null,
      previousDeliveryStatus: fresh.deliveryStatus ?? null,
      newDeliveryStatus: safePatch.deliveryStatus ?? fresh.deliveryStatus ?? null,
      firestorePath: `orders/${orderId}`,
      source: "repairOrderPaidState.ts#repairOrderPaidStateIfNeeded",
    });
    console.log("[ORDER WRITE TRACE]", "repairOrderPaidState.ts", "repairOrderPaidStateIfNeeded", {
      orderId,
      status: safePatch.status ?? null,
      deliveryStatus: safePatch.deliveryStatus ?? null,
      paymentStatus: safePatch.paymentStatus ?? null,
      updatedBy: safePatch.updatedBy ?? "repairOrderPaidState",
      op: "update",
    });

    tx.update(orderRef, safePatch);
    applied = true;
  });

  if (applied) {
    logger.info("[order-paid-repair] applied", {orderId, before});
  }

  return applied;
}
