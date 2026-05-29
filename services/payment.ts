import { openPaymentSheet } from '@/services/stripe';

export async function payOrderWithStripe(params: {
  orderId: string;
  amount: number;
}): Promise<void> {
  const orderId = params.orderId.trim();
  if (!orderId) throw new Error('Missing order id');
  const amount = Math.round(Number(params.amount) * 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid amount.');
  }
  const result = await openPaymentSheet({
    orderId,
    amount,
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
