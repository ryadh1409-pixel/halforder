import { createPaymentIntent } from '../stripePayment';

export type RunPaymentSheetCheckoutParams = {
  amountCents: number;
  userId: string;
  items?: unknown[];
};

/**
 * Creates Firestore order + PaymentIntent via Cloud Function; returns client secret only.
 * Caller must `initPaymentSheet` + `presentPaymentSheet` (PaymentSheet).
 * Paid state is applied only by the Stripe webhook — not by this call alone.
 */
export async function runPaymentSheetCheckout(
  params: RunPaymentSheetCheckoutParams,
): Promise<string> {
  console.log('[PaymentSheet] runPaymentSheetCheckout start, params:', {
    amountCents: params.amountCents,
    userId: params.userId,
    itemsLen: Array.isArray(params.items) ? params.items.length : 0,
  });

  const { clientSecret, orderId, response } = await createPaymentIntent({
    amount: params.amountCents,
    userId: params.userId,
    items: params.items,
  });

  console.log('[PaymentSheet] API RESPONSE:', response);
  console.log('[PaymentSheet] orderId:', orderId ?? '(none)');
  console.log('[PaymentSheet] clientSecret prefix:', clientSecret ? `${clientSecret.slice(0, 12)}…` : '(missing)');

  if (typeof clientSecret !== 'string' || !clientSecret.trim()) {
    throw new Error('Missing clientSecret');
  }

  return clientSecret.trim();
}
