#!/usr/bin/env bash
# Requires: Stripe CLI installed (`brew install stripe/stripe-cli/stripe`).
# Forward webhooks first, e.g.:
#   stripe listen --forward-to http://127.0.0.1:5001/halforfer/us-central1/stripeWebhook
# Then run this script in another terminal — events are delivered to that URL.

set -euo pipefail

if ! command -v stripe >/dev/null 2>&1; then
  echo "❌ Stripe CLI not found. Install: https://stripe.com/docs/stripe-cli"
  exit 1
fi

echo "🚀 Sending test webhook (payment_intent.succeeded)..."

stripe trigger payment_intent.succeeded

echo "✅ Done"
