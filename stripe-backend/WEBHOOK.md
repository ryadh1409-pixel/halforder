# Stripe webhook (`stripeWebhook`)

## Endpoint

Production (example):

`https://us-central1-halforfer.cloudfunctions.net/stripeWebhook`

This function runs on **Firebase Functions v2** (`onRequest`). Stripe signatures are verified using **`req.rawBody`** (buffer). Do not wrap this handler with `express.json()` or any middleware that parses the body before verification.

## Fix: “STRIPE_WEBHOOK_SECRET not configured” in logs

That means **Secret Manager has no value mounted on this function revision**, or the secret names don’t match what `stripeWebhook` declares (`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`).

Do this **once per project** (replace project id if needed):

```bash
firebase login
firebase use halforfer

# Interactive paste (recommended):
./scripts/configure-stripe-webhook-secrets.sh halforfer

# Or manually:
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project halforfer
firebase functions:secrets:set STRIPE_SECRET_KEY --project halforfer
```

Then **redeploy** so Cloud Functions attaches both secrets to `stripeWebhook`:

```bash
npm run deploy:stripe-webhook
```

Verify logs after a real Stripe delivery:

```bash
npm run logs:stripe-webhook
```

You should see **`[stripeWebhook] Verified event`** (not `STRIPE_WEBHOOK_SECRET not configured`).

### Emulator local secrets

Copy `secret.local.example` → **`.secret.local`** in `stripe-backend/` with `STRIPE_WEBHOOK_SECRET` / `STRIPE_SECRET_KEY` for `firebase emulators:start --only functions`. (`*.local` is gitignored.)

## Where secrets live

| Secret | Purpose |
|--------|---------|
| `STRIPE_WEBHOOK_SECRET` | Stripe signing secret for `constructEvent` (Dashboard endpoint **or** CLI `whsec_…` from `stripe listen`) |
| `STRIPE_SECRET_KEY` | Stripe API key — required by the Node SDK instance used to call `webhooks.constructEvent` |

Both are **Google Secret Manager** secrets. They are declared with **`defineSecret`** and listed under **`secrets: [...]`** on `onRequest` in `src/stripeWebhook.ts`. At runtime the handler resolves **`defineSecret().value()`** first, then **`process.env.STRIPE_*`** (Functions also injects bound secrets as env vars).

### Rotate secrets

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project halforfer
firebase functions:secrets:set STRIPE_SECRET_KEY --project halforfer
npm run deploy:stripe-webhook
```

## Redeploy

```bash
cd stripe-backend && npm run build
cd .. && firebase deploy --only functions:functions:stripeWebhook
```

Or from repo root:

```bash
npm run deploy:stripe-webhook
```

(`functions` = codebase id in `firebase.json`; second segment = function name.)

To deploy the whole stripe-backend codebase:

```bash
firebase deploy --only functions:functions
```

## HTTP behavior

| Situation | Status |
|-----------|--------|
| Verified event, handler OK | **200** `{ "received": true }` |
| Missing / invalid signature | **400** |
| Missing `rawBody` (misconfiguration) | **500** |
| Firestore / unexpected handler error | **500** (Stripe retries) |

## Supported events

- **`payment_intent.succeeded`** — reads `metadata.orderId`, marks order paid in Firestore (matches PaymentSheet metadata from `createPaymentIntent`).
- **`checkout.session.completed`** — reads `metadata.orderId`, marks order paid (Checkout Session flow).

Events without `orderId` are acknowledged with **200** so test triggers do not cause infinite retries.

## Local testing (Stripe CLI)

1. Start the Functions emulator (project id must match yours):

   ```bash
   firebase emulators:start --only functions
   ```

2. Forward webhooks (listen prints a **`whsec_` secret** — use that for emulator/secret override):

   ```bash
   stripe listen --forward-to http://127.0.0.1:5001/halforfer/us-central1/stripeWebhook
   ```

3. Send a test event:

   ```bash
   npm run test:webhook
   ```

Watch emulator logs for `[stripeWebhook]` lines.

## Stripe Dashboard

Add the HTTPS endpoint and subscribe at minimum to:

- `payment_intent.succeeded`
- `checkout.session.completed` (if you use Checkout)

Use the **signing secret** from that endpoint as `STRIPE_WEBHOOK_SECRET`.
