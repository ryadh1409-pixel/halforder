import { auth, db } from '@/services/firebase';
import { calculatePaymentBreakdown } from '@/services/paymentSimulation';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type PaymentOrderSummary = {
  orderId: string;
  mealName: string;
  amountSubtotal: number;
  hstAmount: number;
  platformFee: number;
  restaurantAmount: number;
  totalAmount: number;
  currency: 'cad';
  restaurantId: string;
  restaurantStripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

type CreatePaymentIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
  paymentId: string;
  amountSubtotal: number;
  hstAmount: number;
  totalAmount: number;
  platformFee: number;
  restaurantAmount: number;
  currency: 'cad';
};

type FinalizePaymentResponse = {
  success: boolean;
  paymentId: string;
};

export async function getPaymentOrderSummary(
  orderId: string,
): Promise<PaymentOrderSummary | null> {
  const orderSnap = await getDoc(doc(db, 'orders', orderId));
  if (!orderSnap.exists()) return null;
  const order = orderSnap.data() as Record<string, unknown>;
  const mealId = typeof order.mealId === 'string' ? order.mealId : '';
  const restaurantId = typeof order.restaurantId === 'string' ? order.restaurantId : '';
  const mealSnap = mealId ? await getDoc(doc(db, 'meals', mealId)) : null;
  const restaurantSnap = restaurantId
    ? await getDoc(doc(db, 'restaurants', restaurantId))
    : null;
  const meal = mealSnap?.exists() ? (mealSnap.data() as Record<string, unknown>) : {};
  const restaurant = restaurantSnap?.exists()
    ? (restaurantSnap.data() as Record<string, unknown>)
    : {};
  const mealName = typeof meal.name === 'string' ? meal.name : 'Shared meal';
  const sharedPrice = typeof meal.sharedPrice === 'number' ? meal.sharedPrice : 0;
  const breakdown = calculatePaymentBreakdown(sharedPrice);
  return {
    orderId,
    mealName,
    amountSubtotal: breakdown.subtotalPerUser,
    hstAmount: breakdown.hstAmount,
    platformFee: breakdown.platformFee,
    restaurantAmount: breakdown.restaurantAmount,
    totalAmount: breakdown.totalPerUser,
    currency: 'cad',
    restaurantId,
    restaurantStripeAccountId:
      typeof restaurant.stripeAccountId === 'string' ? restaurant.stripeAccountId : null,
    chargesEnabled: restaurant.chargesEnabled === true,
    payoutsEnabled: restaurant.payoutsEnabled === true,
  };
}

export async function createPaymentIntentForOrder(params: {
  orderId: string;
  amountSubtotal: number;
}): Promise<CreatePaymentIntentResponse> {
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('You must be signed in to pay.');
  const callable = httpsCallable<
    { orderId: string; amountSubtotal: number },
    CreatePaymentIntentResponse
  >(getFunctions(), 'createPaymentIntent');
  const result = await callable({
    orderId: params.orderId,
    amountSubtotal: params.amountSubtotal,
  });
  await setDoc(
    doc(db, 'payments', result.data.paymentId),
    {
      orderId: params.orderId,
      userId,
      amountSubtotal: result.data.amountSubtotal,
      subtotal: result.data.amountSubtotal,
      hstAmount: result.data.hstAmount,
      hst: result.data.hstAmount,
      totalAmount: result.data.totalAmount,
      total: result.data.totalAmount,
      platformFee: result.data.platformFee,
      restaurantAmount: result.data.restaurantAmount,
      currency: result.data.currency,
      status: 'pending',
      stripePaymentIntentId: result.data.paymentIntentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return result.data;
}

export async function finalizeOrderPayment(params: {
  orderId: string;
  paymentId: string;
  paymentIntentId: string;
}): Promise<void> {
  const callable = httpsCallable<
    { orderId: string; paymentId: string; paymentIntentId: string },
    FinalizePaymentResponse
  >(getFunctions(), 'finalizePayment');
  await callable(params);
}

export async function subscribeMyPaymentHistory(): Promise<
  Array<{ id: string; amount: number; status: string; createdAt?: unknown; orderId: string }>
> {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];
  const q = query(
    collection(db, 'payments'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      amount:
        typeof raw.totalAmount === 'number'
          ? raw.totalAmount
          : typeof raw.amount === 'number'
            ? raw.amount
            : 0,
      status: typeof raw.status === 'string' ? raw.status : 'pending',
      createdAt: raw.createdAt,
      orderId: typeof raw.orderId === 'string' ? raw.orderId : '',
    };
  });
}

export type InvoiceRecord = {
  id: string;
  paymentId: string;
  invoiceNumber: string;
  subtotal: number;
  hst: number;
  total: number;
  createdAt?: unknown;
  mealName?: string;
  currency?: string;
};

export async function getInvoiceByPaymentId(paymentId: string): Promise<InvoiceRecord | null> {
  const snap = await getDoc(doc(db, 'invoices', paymentId));
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    paymentId: typeof raw.paymentId === 'string' ? raw.paymentId : paymentId,
    invoiceNumber:
      typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber : `INV-${snap.id.slice(0, 8)}`,
    subtotal: typeof raw.subtotal === 'number' ? raw.subtotal : 0,
    hst: typeof raw.hst === 'number' ? raw.hst : 0,
    total: typeof raw.total === 'number' ? raw.total : 0,
    createdAt: raw.createdAt,
    mealName: typeof raw.mealName === 'string' ? raw.mealName : 'Shared meal',
    currency: typeof raw.currency === 'string' ? raw.currency : 'cad',
  };
}

export async function listRestaurantPayoutPayments(restaurantId: string): Promise<
  Array<{ id: string; total: number; restaurantAmount: number; status: string; payoutAvailableAt?: unknown }>
> {
  const q = query(
    collection(db, 'payments'),
    where('restaurantId', '==', restaurantId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      total:
        typeof raw.totalAmount === 'number'
          ? raw.totalAmount
          : typeof raw.amount === 'number'
            ? raw.amount
            : 0,
      restaurantAmount: typeof raw.restaurantAmount === 'number' ? raw.restaurantAmount : 0,
      status: typeof raw.status === 'string' ? raw.status : 'pending',
      payoutAvailableAt: raw.payoutAvailableAt,
    };
  });
}

export async function markPaymentFailed(paymentId: string): Promise<void> {
  await updateDoc(doc(db, 'payments', paymentId), {
    status: 'failed',
    updatedAt: serverTimestamp(),
  });
}
