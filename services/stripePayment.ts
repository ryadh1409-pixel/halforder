import { resolvePaymentIntentPostUrl } from '@/frontend/config/paymentIntentApi';
import { requireAuthReady } from '@/services/authGuard';
import { auth } from '@/services/firebase';

export type CreatePaymentIntentApiBody = {
  clientSecret?: string;
  orderId?: string;
  error?: string;
};

export type CreatePaymentIntentResult = {
  clientSecret: string;
  orderId?: string;
  response: CreatePaymentIntentApiBody;
};

export type CreateOrderPaymentIntentParams = {
  amount: number;
  userId: string;
  items?: unknown[];
};

/** Stripe PaymentIntent client secrets contain `_secret_` (e.g. pi_xxx_secret_yyy). */
export function normalizePaymentIntentClientSecret(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || !s.includes('_secret_')) return null;
  return s;
}

/**
 * Creates Firestore `orders` doc + Cloud Function PaymentIntent (metadata.orderId).
 * Order `paymentStatus` becomes `paid` only via Stripe webhook (`payment_intent.succeeded`).
 */
export async function createPaymentIntent(
  params: CreateOrderPaymentIntentParams,
): Promise<CreatePaymentIntentResult> {
  await requireAuthReady();
  const { amount, userId, items } = params;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer.');
  }
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('userId is required.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  if (user.uid !== userId.trim()) {
    throw new Error('userId must match the signed-in user.');
  }

  const url = resolvePaymentIntentPostUrl();
  console.log('🔥 USING URL:', url);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`,
  };

  const body = JSON.stringify({
    amount,
    userId: userId.trim(),
    items: Array.isArray(items) ? items : [],
  });
  console.log('[stripePayment] POST', url, 'body keys: amount, userId, items');

  let httpResponse: Response;
  try {
    httpResponse = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
  } catch (e) {
    console.error('[stripePayment] network error (full):', e);
    throw e instanceof Error ? e : new Error(String(e));
  }

  const contentType = httpResponse.headers.get('content-type') || '';
  const rawText = await httpResponse.text();
  console.log('[stripePayment] HTTP status:', httpResponse.status, 'content-type:', contentType);
  console.log('[stripePayment] RAW body:', rawText);

  let json: CreatePaymentIntentApiBody = {};
  const trimmed = rawText.trim();
  if (trimmed) {
    try {
      json = JSON.parse(trimmed) as CreatePaymentIntentApiBody;
    } catch (parseErr) {
      console.error('[stripePayment] JSON.parse failed:', parseErr);
      json = { error: trimmed.slice(0, 500) };
    }
  }

  console.log('[stripePayment] API RESPONSE:', json);

  if (!httpResponse.ok) {
    const msg = json.error || `Unable to create payment intent (HTTP ${httpResponse.status}).`;
    console.error('[stripePayment] request failed:', msg);
    throw new Error(msg);
  }

  const secret = normalizePaymentIntentClientSecret(json.clientSecret);
  if (!secret) {
    const msg =
      json.error ||
      'Invalid payment intent response: clientSecret missing or does not contain _secret_.';
    console.error('[stripePayment]', msg, 'raw clientSecret field:', json.clientSecret);
    throw new Error(msg);
  }

  const orderId = typeof json.orderId === 'string' ? json.orderId : undefined;

  return { clientSecret: secret, orderId, response: json };
}
