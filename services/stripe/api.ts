import { resolvePaymentIntentPostUrl } from '@/frontend/config/paymentIntentApi';
import { auth } from '@/services/firebase';
import { normalizePaymentIntentClientSecret } from '@/services/stripePayment';

/** @deprecated Prefer `createPaymentIntent` from `@/services/stripePayment`. */
export async function createPaymentIntentRequest(amount: number): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  const url = resolvePaymentIntentPostUrl();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ amount, userId: user.uid, items: [] }),
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
