import { openPaymentSheet } from '@/services/stripe';

/**
 * Reusable order payment entry — opens Stripe PaymentSheet only
 * (Apple Pay, Link, saved cards, new card). No custom payment UI.
 */
export async function payOrderWithStripe(params: {
  orderId: string;
  amount: number;
}): Promise<void> {
  const orderId = params.orderId.trim();
  if (!orderId) throw new Error('Missing order id');
  const STRIPE_MIN_AMOUNT_CENTS = 50;
  const amountCents = Math.round(Number(params.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw new Error('Invalid amount.');
  }
  const chargeAmountCents =
    amountCents === 0
      ? 0
      : Math.max(amountCents, STRIPE_MIN_AMOUNT_CENTS);
  const result = await openPaymentSheet({
    orderId,
    amount: chargeAmountCents,
    merchantDisplayName: 'HalfOrder',
  });
  if (result.status !== 'success') {
    if (result.status === 'canceled') {
      throw new Error('Payment canceled.');
    }
    if (result.status === 'redirected') {
      throw new Error('Redirected to Stripe Checkout.');
    }
    throw new Error(result.message || 'Payment failed.');
  }
  // Paid state is written by Stripe webhook; UI should listen to the order doc in realtime.
}
