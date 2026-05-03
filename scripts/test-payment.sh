#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq not found. Install with:"
  echo "   brew install jq"
  exit 1
fi

# ===== CONFIG =====
PROJECT_ID="halforfer"
FUNCTION_URL="https://us-central1-${PROJECT_ID}.cloudfunctions.net/createPaymentIntent"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"

if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "❌ Missing STRIPE_SECRET_KEY. Export it first:"
  echo "export STRIPE_SECRET_KEY=sk_test_xxx"
  exit 1
fi

AMOUNT="${1:-1000}"

echo "🚀 Creating PaymentIntent (amount=${AMOUNT})..."

# ===== CREATE INTENT =====
RESP=$(curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "{\"amount\":${AMOUNT}}")

echo "📦 Raw response: $RESP"

CLIENT_SECRET=$(echo "$RESP" | jq -r '.clientSecret')

if [ -z "$CLIENT_SECRET" ] || [ "$CLIENT_SECRET" = "null" ]; then
  echo "❌ Failed to get clientSecret"
  exit 1
fi

echo "✅ clientSecret: $CLIENT_SECRET"

# ===== EXTRACT PAYMENT INTENT ID =====
PI_ID="${CLIENT_SECRET%%_secret_*}"
echo "🔑 PaymentIntent ID: $PI_ID"

# ===== CONFIRM PAYMENT =====
echo "💳 Confirming payment with test card..."

CONFIRM_RESP=$(curl -s https://api.stripe.com/v1/payment_intents/$PI_ID/confirm \
  -u "$STRIPE_SECRET_KEY:" \
  -d payment_method=pm_card_visa)

echo "📦 Confirm response: $CONFIRM_RESP"

STATUS=$(echo "$CONFIRM_RESP" | jq -r '.status')

echo "🎯 FINAL STATUS: $STATUS"

if [ "$STATUS" = "succeeded" ]; then
  echo "🔥 PAYMENT SUCCESS"
else
  echo "⚠️ Payment not completed"
fi
