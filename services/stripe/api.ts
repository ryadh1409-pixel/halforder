import { resolvePaymentIntentPostUrl } from '@/frontend/config/paymentIntentApi';
import { normalizePaymentIntentClientSecret } from '@/services/stripePayment';

/** @deprecated Prefer `createPaymentIntent` from `@/services/stripePayment`. */
export async function createPaymentIntentRequest(amount: number): Promise<string> {
  const url = resolvePaymentIntentPostUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  const raw = await response.text();
  let json: { clientSecret?: string; error?: string };
  try {
    json = raw.trim() ? (JSON.parse(raw) as { clientSecret?: string; error?: string }) : {};
  } catch {
    throw new Error(raw || 'Failed to create payment intent');
  }
  const secret = normalizePaymentIntentClientSecret(json.clientSecret);
  if (!response.ok || !secret) {
    throw new Error(json.error || 'Failed to create payment intent');
  }
  return secret;
}
