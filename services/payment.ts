import { serverTimestamp } from 'firebase/firestore';
import { updatePaymentOrderWithRetry } from './paymentFlowFirestore';
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
    throw new Error(result.message || 'Payment failed.');
  }
  await updatePaymentOrderWithRetry({
    orderId,
    operation: 'set_paid',
    payload: {
      paymentStatus: 'paid',
      paymentIntentId: result.paymentIntentId,
      stripePaymentIntentId: result.paymentIntentId,
      status: 'pending_driver',
      deliveryStatus: 'waiting_driver',
      driverId: null,
      assignedDriverId: null,
      paidAt: serverTimestamp(),
    },
  });
}
