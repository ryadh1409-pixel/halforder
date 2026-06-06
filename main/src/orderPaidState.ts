/**
 * Mirror of `lib/orderPaidState.ts` for Cloud Functions (main codebase).
 * Keep in sync when changing paid-state rules.
 */
import {isDriverFulfillmentAdvanced} from "./driverFulfillmentGuard.js";
import {hasFulfillmentProgressMarkers} from "./orderFulfillmentSignals.js";
import {sanitizeOrderPatchAgainstRegression} from "./orderStageMonotonic.js";
export const POST_PAYMENT_ORDER_STATUS = "payment_confirmed" as const;

export const PRE_PAYMENT_ORDER_STATUSES = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
]);

/** Stages where Stripe/repair must not reset fulfillment (kitchen or courier). */
export const FULFILLED_STATUSES = new Set([
  "accepted",
  "restaurant_accepted",
  "preparing",
  "ready",
  "ready_for_pickup",
  "driver_assigned",
  "picked_up",
  "on_the_way",
  "arrived_customer",
  "delivered",
  "completed",
  "cancelled",
]);

/** @deprecated Use {@link FULFILLED_STATUSES} — kept for imports that reference kitchen-only name. */
export const FULFILLED_KITCHEN_STATUSES = FULFILLED_STATUSES;

export function isOrderFulfilledForPaidPatch(order: OrderPaidStateInput): boolean {
  if (isDriverFulfillmentAdvanced(order.deliveryStatus)) {
    return true;
  }
  const status = orderStatusString(order.status).toLowerCase();
  if (FULFILLED_STATUSES.has(status)) {
    return true;
  }
  const courier = orderStatusString(order.deliveryStatus).toLowerCase();
  return FULFILLED_STATUSES.has(courier);
}

/** Hard stop — Stripe webhook / repair must not touch the order document at all. */
export function shouldBlockStripePaymentOverwrite(
  order: OrderPaidStateInput & Record<string, unknown>,
): boolean {
  if (hasFulfillmentProgressMarkers(order)) return true;
  if (isOrderFulfilledForPaidPatch(order)) return true;
  if (order.earningsRecorded === true) return true;
  if (order.marketplaceArchived === true) return true;
  const status = orderStatusString(order.status).toLowerCase();
  const courier = orderStatusString(order.deliveryStatus).toLowerCase();
  return FULFILLED_STATUSES.has(status) || FULFILLED_STATUSES.has(courier);
}

export type OrderPaidStateInput = {
  status?: unknown;
  paymentStatus?: unknown;
  deliveryStatus?: unknown;
  deliveryType?: unknown;
};

export function orderStatusString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function orderPaymentStatusString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function needsPaidStatusRepair(order: OrderPaidStateInput): boolean {
  const paymentStatus = orderPaymentStatusString(order.paymentStatus);
  const status = orderStatusString(order.status);
  if (paymentStatus !== "paid" || !PRE_PAYMENT_ORDER_STATUSES.has(status)) {
    return false;
  }
  if (isDriverFulfillmentAdvanced(order.deliveryStatus)) {
    return false;
  }
  const courier = orderStatusString(order.deliveryStatus).toLowerCase();
  if (FULFILLED_STATUSES.has(courier)) {
    return false;
  }
  return true;
}

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

export function buildPaymentOnlyPaidStatePatch(
  input: BuildOrderPaidStatePatchInput = {},
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    paymentStatus: "paid",
  };
  appendPaidStateMetadata(patch, input);
  return patch;
}

export function buildOrderPaidStatePatch(
  existing: OrderPaidStateInput & Record<string, unknown>,
  input: BuildOrderPaidStatePatchInput = {},
): Record<string, unknown> {
  if (hasFulfillmentProgressMarkers(existing) || isOrderFulfilledForPaidPatch(existing)) {
    return buildPaymentOnlyPaidStatePatch(input);
  }

  const currentStatus = orderStatusString(existing.status);
  const patch: Record<string, unknown> = {
    paymentStatus: "paid",
    status: resolvePostPaymentOrderStatus(existing, currentStatus),
  };

  const courierFulfillmentAdvanced =
    isDriverFulfillmentAdvanced(existing.deliveryStatus) ||
    FULFILLED_STATUSES.has(orderStatusString(existing.deliveryStatus).toLowerCase());

  if (!input.repairOnly) {
    if (!courierFulfillmentAdvanced) {
      patch.deliveryStatus = "pending";
    }
    if (!courierFulfillmentAdvanced) {
      patch.driverId = null;
      patch.assignedDriverId = null;
    }
  } else {
    const ds = orderStatusString(existing.deliveryStatus);
    if ((!ds || ds === "pending") && !courierFulfillmentAdvanced) {
      patch.deliveryStatus = "pending";
    }
  }

  appendPaidStateMetadata(patch, input);

  return sanitizeOrderPatchAgainstRegression(existing, patch);
}
