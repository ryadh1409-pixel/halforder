#!/usr/bin/env bash
# Configure Secret Manager values required by stripeWebhook (Firebase Functions v2).
# Run from repo root after: firebase login && firebase use <project>
#
# Usage:
#   ./scripts/configure-stripe-webhook-secrets.sh [PROJECT_ID]
#
# STRIPE_WEBHOOK_SECRET: Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret (whsec_...)
# STRIPE_SECRET_KEY:     Stripe Dashboard → Developers → API keys (same key used by createPaymentIntent)

set -euo pipefail
PROJECT="${1:-${GCLOUD_PROJECT:-halforfer}}"

echo "Project: ${PROJECT}"
echo ""
echo "You will paste each value when prompted (input is hidden where supported)."
echo ""

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project "${PROJECT}"
firebase functions:secrets:set STRIPE_SECRET_KEY --project "${PROJECT}"

echo ""
echo "Secrets stored. Deploy the webhook so this revision mounts them:"
echo "  firebase use ${PROJECT}"
echo "  npm run deploy:stripe-webhook"
echo ""
echo "Tail logs:"
echo "  firebase functions:log --only stripeWebhook --project ${PROJECT}"
