import { resolvePaymentIntentPostUrl } from '@/frontend/config/paymentIntentApi';
import { auth } from '@/services/firebase';

export type CreatePaymentIntentApiBody = {
  clientSecret?: string;
  error?: string;
};

export type CreatePaymentIntentResult = {
  clientSecret: string;
  response: CreatePaymentIntentApiBody;
};

function parsePaymentIntentBody(text: string, status: number): CreatePaymentIntentApiBody {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: `HTTP ${status}` };
  }
  try {
    return JSON.parse(trimmed) as CreatePaymentIntentApiBody;
  } catch {
    return { error: trimmed };
  }
}

/** Stripe PaymentIntent client secrets contain `_secret_` (e.g. pi_xxx_secret_yyy). */
export function normalizePaymentIntentClientSecret(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || !s.includes('_secret_')) return null;
  return s;
}

/**
 * POST Cloud Function `createPaymentIntent` — body `{ amount }` (cents).
 * Deploy: `firebase deploy --only functions`
 */
export async function createPaymentIntent(amount: number): Promise<CreatePaymentIntentResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer.');
  }

  const url = resolvePaymentIntentPostUrl();
  console.log('🔥 USING URL:', url);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const user = auth.currentUser;
  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  let httpResponse: Response;
  try {
    httpResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount }),
    });
  } catch (e) {
    console.error('[stripePayment] network error (full):', e);
    throw e instanceof Error ? e : new Error(String(e));
  }

  const rawText = await httpResponse.text();
  console.log('🔥 STATUS:', httpResponse.status);
  console.log('🔥 RAW:', rawText);

  const json = parsePaymentIntentBody(rawText, httpResponse.status);

  if (!httpResponse.ok) {
    throw new Error(json.error || `Unable to create payment intent (HTTP ${httpResponse.status}).`);
  }

  const secret = normalizePaymentIntentClientSecret(json.clientSecret);
  if (!secret) {
    throw new Error(
      json.error ||
        'Invalid payment intent response: clientSecret missing or does not contain _secret_.',
    );
  }

  return { clientSecret: secret, response: json };
}
