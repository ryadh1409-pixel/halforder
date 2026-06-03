import {hasFulfillmentProgressMarkers} from "./orderFulfillmentSignals.js";
import {wouldDowngradeLifecycle} from "./orderLifecyclePriority.js";
import {
  sanitizeOrderPatchAgainstRegression,
  type MonotonicOrderInput,
} from "./orderStageMonotonic.js";
import {orderStatusString} from "./orderPaidState.js";

function stripFulfillmentFields(patch: Record<string, unknown>): Record<string, unknown> {
  const safe = {...patch};
  delete safe.status;
  delete safe.deliveryStatus;
  if (safe.driverId === null) delete safe.driverId;
  if (safe.assignedDriverId === null) delete safe.assignedDriverId;
  if (safe.driverName === null) delete safe.driverName;
  if (safe.driverPhone === null) delete safe.driverPhone;
  return safe;
}

export function prepareServerOrderPatch(
  orderId: string,
  current: MonotonicOrderInput & Record<string, unknown>,
  patch: Record<string, unknown>,
  updatedBy: string,
): Record<string, unknown> {
  const withMeta = {
    ...patch,
    updatedBy,
  };

  if (hasFulfillmentProgressMarkers(current)) {
    const paymentOnly = stripFulfillmentFields(withMeta);
    return sanitizeOrderPatchAgainstRegression(current, paymentOnly);
  }

  if (wouldDowngradeLifecycle(current, withMeta)) {
    console.log("[SERVER DOWNGRADE BLOCKED]", {
      orderId,
      updatedBy,
      currentStatus: orderStatusString(current.status),
      incomingStatus: patch.status ?? null,
      currentDeliveryStatus: current.deliveryStatus ?? null,
      incomingDeliveryStatus: patch.deliveryStatus ?? null,
    });
    const stripped = stripFulfillmentFields(withMeta);
    delete stripped.paymentStatus;
    return sanitizeOrderPatchAgainstRegression(current, stripped);
  }

  const safe = sanitizeOrderPatchAgainstRegression(current, withMeta);
  if (
    safe.status === "payment_confirmed" &&
    (safe.deliveryStatus === "pending" || safe.deliveryStatus === "") &&
    hasFulfillmentProgressMarkers(current)
  ) {
    console.log("[SERVER DOWNGRADE BLOCKED]", {
      orderId,
      updatedBy,
      reason: "payment_confirmed_pending_after_fulfillment",
      currentStatus: orderStatusString(current.status),
    });
    delete safe.status;
    delete safe.deliveryStatus;
  }
  return safe;
}
