/**
 * Production payment + fulfillment state documentation.
 *
 * Order document (`orders/{orderId}`) uses:
 * - `status` — primary fulfillment gate (see OrderStatus in orderService).
 * - `paymentStatus` — Stripe settlement gate (`unpaid` | `processing` | `paid` | `failed` | `refunded`).
 *
 * Intended lifecycle (marketplace delivery):
 * 1. `awaiting_payment` + `unpaid` — cart converted to order; customer pays.
 * 2. `payment_processing` + `processing` — PaymentIntent created; sheet presented (native).
 * 3. Webhook `payment_intent.succeeded` or `checkout.session.completed` → `paid` + `pending_driver`
 *    (restaurant prep continues from restaurant dashboard).
 * 4. Restaurant: `pending` / `accepted` / `preparing` / `ready_for_pickup` (existing flows).
 * 5. Driver: `driver_assigned` → `picked_up` → `delivered`.
 * 6. Failures: webhook `payment_intent.payment_failed` → `payment_failed` + `failed` + `paymentFailedAt`.
 *
 * Aliases for dashboards / analytics:
 * - `pending_payment` === `awaiting_payment`
 * - `paid` is reflected by `paymentStatus: paid` (not always a distinct `status` value).
 */
export const PAYMENT_FLOW_VERSION = 1 as const;

export type PaymentTimelineStep = { id: string; label: string };

/** Customer-facing payment steps (shown above fulfillment timeline). */
export const PAYMENT_TIMELINE_STEPS: PaymentTimelineStep[] = [
  { id: 'pending_payment', label: 'Awaiting payment' },
  { id: 'payment_processing', label: 'Processing payment' },
  { id: 'paid', label: 'Payment confirmed' },
];
