import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { openPaymentSheet } from './stripePayment';

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
  await updateDoc(doc(db, 'orders', orderId), {
    paymentStatus: 'paid',
    stripePaymentIntentId: result.paymentIntentId,
    amount,
    createdAt: serverTimestamp(),
    status: 'pending',
  });
}
