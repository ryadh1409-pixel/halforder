/**
 * Mirror of `lib/orderPaidState.ts` for Cloud Functions (main codebase).
 * Keep in sync when changing paid-state rules.
 */
export const POST_PAYMENT_ORDER_STATUS = "pending" as const;

export const PRE_PAYMENT_ORDER_STATUSES = new Set([
  "awaiting_payment",
  "pending_payment",
  "payment_processing",
  "payment_failed",
]);

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
  return paymentStatus === "paid" && PRE_PAYMENT_ORDER_STATUSES.has(status);
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

export function buildOrderPaidStatePatch(
  existing: OrderPaidStateInput & Record<string, unknown>,
  input: BuildOrderPaidStatePatchInput = {},
): Record<string, unknown> {
  const currentStatus = orderStatusString(existing.status);
  const patch: Record<string, unknown> = {
    paymentStatus: "paid",
    status: resolvePostPaymentOrderStatus(existing, currentStatus),
  };

  if (!input.repairOnly) {
    patch.deliveryStatus = "pending";
    patch.driverId = null;
    patch.assignedDriverId = null;
  } else {
    const ds = orderStatusString(existing.deliveryStatus);
    if (!ds || ds === "pending") {
      patch.deliveryStatus = "pending";
    }
  }

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

  return patch;
}
