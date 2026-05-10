# Stripe setup (HalfOrder / OurFood)

## Overview

- **Native checkout**: `@stripe/stripe-react-native` loads only on iOS/Android (`services/stripe/stripe.native.tsx`). Web uses `services/stripe/stripe.web.ts` (no native Stripe imports).
- **PaymentIntent**: Firebase Callable `createPaymentIntent` (Gen1, `us-central1`) creates intents with Connect `transfer_data.destination` to the restaurant’s `stripeAccountId`.
- **Webhook**: HTTPS function **`stripeWebhook`** (Gen2, `us-central1`) verifies signatures and updates Firestore idempotently.

## Environment / secrets

| Secret | Used by |
|--------|---------|
| `STRIPE_SECRET_KEY` | `createPaymentIntent`, `stripeWebhook` |
| `STRIPE_WEBHOOK_SECRET` | `stripeWebhook` |

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

Webhook URL (Dashboard → Developers → Webhooks):  
`https://us-central1-<PROJECT_ID>.cloudfunctions.net/stripeWebhook`

Subscribe to:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Metadata on PaymentIntents

The callable writes Stripe metadata (strings):

- `orderId`, `userId`, `restaurantId`, `driverId` (empty if unassigned), plus legacy `uid`.

Only the Firebase Auth user who owns the order (`userId` / `customerId`) may create an intent.

## Firestore model

| Field | Meaning |
|-------|---------|
| `paymentStatus` | `unpaid` → `processing` → `paid` / `failed` |
| `status` | Includes `payment_processing`, `payment_failed`, then fulfillment (`pending_driver`, …) |
| `paidAt` | Server timestamp (webhook) |
| `paymentFailedAt` | Server timestamp (webhook, failures) |
| `paymentIntentId` / `stripePaymentIntentId` | Stripe PI id |
| `checkoutSessionId` | Set when Checkout Session completes |

Processed webhook events are stored under **`stripe_processed_events/{stripeEventId}`** (client access denied in rules).

## Testing

**Test cards** (Stripe test mode): `4242 4242 4242 4242` success; decline scenarios via [Stripe test helpers](https://stripe.com/docs/testing).

**Manual checks**

1. Create order → pay on native → order becomes `paid`, `pending_driver`; timeline updates live on tracking.
2. Stripe Dashboard → resend same event → order unchanged (duplicate event id skipped).
3. Simulate payment failure → `payment_failed` + retry from checkout.

Automated: `cd stripe-backend && npm run build && npm test` (logic helpers).

## Production readiness checklist

- [ ] Livemode keys only on production project; test keys on dev.
- [ ] Webhook signing secret matches deployed `STRIPE_WEBHOOK_SECRET`.
- [ ] Dashboard webhook endpoints point to Gen2 URL; no duplicate endpoints firing the same logic twice unless intentional.
- [ ] Firestore rules deployed (`firebase deploy --only firestore:rules`).
- [ ] Restaurant onboarding sets `stripeAccountId` before taking live payments.
- [ ] Monitor Functions logs for `[stripeWebhook]` JSON lines and Stripe Dashboard for failed deliveries.
- [ ] Verify iOS, Android, and Expo web: web shows “pay on app” while native completes the sheet.

## Future extensions

Refunds, subscriptions, tips, and multi-restaurant dashboards should:

- Add dedicated HTTPS functions or Stripe Billing objects.
- Extend webhook routing with idempotent handlers (reuse `stripe_processed_events`).
- Avoid widening Firestore client write rules; prefer validated Cloud Functions for money-moving fields.
