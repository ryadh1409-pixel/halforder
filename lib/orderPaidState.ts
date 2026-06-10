import { hasFulfillmentProgressMarkers } from '@/lib/orderFulfillmentSignals';
import {
  FULFILLED_KITCHEN_STATUSES,
  FULFILLED_STATUSES,
  isOrderFulfilledForPaidPatch,
  orderPaymentStatusString,
  orderStatusString,
  POST_PAYMENT_ORDER_STATUS,
  PRE_PAYMENT_ORDER_STATUSES,
  type OrderPaidStateInput,
} from '@/lib/orderSharedTypes';
import { sanitizeOrderPatchAgainstRegression } from '@/services/orderStage';

export {
  FULFILLED_KITCHEN_STATUSES,
  FULFILLED_STATUSES,
  isOrderFulfilledForPaidPatch,
  orderPaymentStatusString,
  orderStatusString,
  POST_PAYMENT_ORDER_STATUS,
  PRE_PAYMENT_ORDER_STATUSES,
  type OrderPaidStateInput,
} from '@/lib/orderSharedTypes';

/**
 * Canonical post-Stripe-payment order fields.
 * Webhook + repair Cloud Function must stay in sync with this module.
 */

/** Resolve target `status` after payment without rewinding active fulfillment. */
export function resolvePostPaymentOrderStatus(
  order: OrderPaidStateInput,
  currentStatus?: string,
): string {
  const status = currentStatus ?? orderStatusString(order.status);
  if (status && !PRE_PAYMENT_ORDER_STATUSES.has(status)) {
    return status;
  }
  return POST_PAYMENT_ORDER_STATUS;
}

export type BuildOrderPaidStatePatchInput = {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  stripeWebhookLastEventType?: string;
  stripeWebhookLastEventId?: string;
  /** Repair-only: do not reset drivers or overwrite paidAt. */
  repairOnly?: boolean;
};

function appendPaidStateMetadata(
  patch: Record<string, unknown>,
  input: BuildOrderPaidStatePatchInput,
): void {
  if (input.paymentIntentId) {
    patch.paymentIntentId = input.paymentIntentId;
    patch.stripePaymentIntentId = input.paymentIntentId;
  }
  if (input.checkoutSessionId) {
    patch.checkoutSessionId = input.checkoutSessionId;
  }
  if (input.stripeWebhookLastEventType) {
    patch.stripeWebhookLastEventType = input.stripeWebhookLastEventType;
  }
  if (input.stripeWebhookLastEventId) {
    patch.stripeWebhookLastEventId = input.stripeWebhookLastEventId;
  }
}

/** Payment + Stripe metadata only — never mutates status/deliveryStatus/drivers. */
export function buildPaymentOnlyPaidStatePatch(
  input: BuildOrderPaidStatePatchInput = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    paymentStatus: 'paid',
    updatedAt: 'SERVER_TIMESTAMP',
  };
  if (!input.repairOnly) {
    patch.paidAt = 'SERVER_TIMESTAMP';
  }
  appendPaidStateMetadata(patch, input);
  return patch;
}

/**
 * Atomic field set for webhook or repair. Caller adds Firestore server timestamps.
 */
function hasAssignedDriver(order: OrderPaidStateInput & Record<string, unknown>): boolean {
  const driverId = orderStatusString(order.driverId);
  const assignedDriverId = orderStatusString(
    (order as Record<string, unknown>).assignedDriverId,
  );
  return driverId.length > 0 || assignedDriverId.length > 0;
}

export function buildOrderPaidStatePatch(
  existing: OrderPaidStateInput & Record<string, unknown>,
  input: BuildOrderPaidStatePatchInput = {},
): Record<string, unknown> {
  if (hasFulfillmentProgressMarkers(existing) || isOrderFulfilledForPaidPatch(existing)) {
    return buildPaymentOnlyPaidStatePatch(input);
  }

  const currentStatus = orderStatusString(existing.status);
  const courier = orderStatusString(existing.deliveryStatus).toLowerCase();

  /** Never re-assert payment_confirmed when courier has advanced past pending. */
  if (
    FULFILLED_STATUSES.has(courier) ||
    hasAssignedDriver(existing) ||
    currentStatus === 'completed' ||
    currentStatus === 'delivered' ||
    existing.earningsRecorded === true
  ) {
    return buildPaymentOnlyPaidStatePatch(input);
  }

  const patch: Record<string, unknown> = {
    paymentStatus: 'paid',
    status: resolvePostPaymentOrderStatus(existing, currentStatus),
    updatedAt: 'SERVER_TIMESTAMP',
  };

  const courierFulfillmentAdvanced =
    FULFILLED_STATUSES.has(courier);

  if (!input.repairOnly) {
    if (!courierFulfillmentAdvanced) {
      patch.deliveryStatus = 'pending';
    }
    if (!courierFulfillmentAdvanced) {
      patch.driverId = null;
      patch.assignedDriverId = null;
    }
    patch.paidAt = 'SERVER_TIMESTAMP';
  } else {
    const ds = orderStatusString(existing.deliveryStatus);
    if ((!ds || ds === 'pending') && !courierFulfillmentAdvanced) {
      patch.deliveryStatus = 'pending';
    }
  }

  appendPaidStateMetadata(patch, input);

  return sanitizeOrderPatchAgainstRegression(existing, patch);
}

/** True when Stripe paid but fulfillment status was never advanced. */
export function needsPaidStatusRepair(order: OrderPaidStateInput): boolean {
  const paymentStatus = orderPaymentStatusString(order.paymentStatus);
  const status = orderStatusString(order.status);
  if (paymentStatus !== 'paid' || !PRE_PAYMENT_ORDER_STATUSES.has(status)) {
    return false;
  }
  const courier = orderStatusString(order.deliveryStatus).toLowerCase();
  if (FULFILLED_STATUSES.has(courier)) {
    return false;
  }
  return true;
}

/** Customer-facing label when payment succeeded but legacy status lags. */
export function isPaidAwaitingStatusRepair(order: OrderPaidStateInput): boolean {
  return needsPaidStatusRepair(order);
}
