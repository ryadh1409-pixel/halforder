import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { auth, db } from './firebase';

type PaymentWriteOperation =
  | 'set_processing'
  | 'set_paid'
  | 'set_unpaid'
  | 'set_failed';

type PaymentWriteInput = {
  orderId: string;
  operation: PaymentWriteOperation;
  payload: Record<string, unknown>;
};

type PaymentPayload = Record<string, unknown>;
type PaymentUpdateAllowedKey =
  | 'status'
  | 'paymentStatus'
  | 'paymentIntentId'
  | 'checkoutSessionId'
  | 'stripePaymentIntentId'
  | 'updatedAt'
  | 'paidAt'
  | 'paymentFailedAt'
  | 'estimatedDeliveryTime'
  | 'deliveryStatus';

const PAYMENT_UPDATE_ALLOWED_KEYS: PaymentUpdateAllowedKey[] = [
  'status',
  'paymentStatus',
  'paymentIntentId',
  'checkoutSessionId',
  'stripePaymentIntentId',
  'updatedAt',
  'paidAt',
  'paymentFailedAt',
  'estimatedDeliveryTime',
  'deliveryStatus',
];

function logPaymentWriteStart(
  op: PaymentWriteOperation,
  path: string,
  uid: string | null,
  payload: Record<string, unknown>,
): void {
  console.log('[PAYMENT FS START]', {
    collection: 'orders',
    documentPath: path,
    operation: op,
    authenticatedUid: uid,
    payload,
  });
}

function logPaymentWriteSuccess(
  op: PaymentWriteOperation,
  path: string,
  uid: string | null,
): void {
  console.log('[PAYMENT FS SUCCESS]', {
    collection: 'orders',
    documentPath: path,
    operation: op,
    authenticatedUid: uid,
  });
}

function logPaymentWriteFail(
  op: PaymentWriteOperation,
  path: string,
  uid: string | null,
  payload: Record<string, unknown>,
  error: unknown,
): void {
  console.error('[PAYMENT FS FAIL]', {
    collection: 'orders',
    documentPath: path,
    operation: op,
    authenticatedUid: uid,
    payload,
    error,
  });
}

function ownerUidFromOrder(data: DocumentData | undefined): string {
  if (!data) return '';
  const candidates = [
    data.userId,
    data.customerId,
    data.creatorId,
    data.createdBy,
    data.hostId,
    Array.isArray(data.users) ? data.users[0] : '',
  ];
  const uid = candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
  return typeof uid === 'string' ? uid.trim() : '';
}

function isRetryableFirestoreError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? '';
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'resource-exhausted'
  );
}

function readRequiredPaymentIntentId(payload: PaymentPayload): string {
  const paymentIntentId = payload.paymentIntentId;
  if (typeof paymentIntentId !== 'string' || paymentIntentId.trim().length === 0) {
    throw new Error('Missing required paymentIntentId for payment operation');
  }
  return paymentIntentId.trim();
}

function readStripePaymentIntentId(payload: PaymentPayload, fallback: string): string {
  const stripePaymentIntentId = payload.stripePaymentIntentId;
  if (
    typeof stripePaymentIntentId === 'string' &&
    stripePaymentIntentId.trim().length > 0
  ) {
    return stripePaymentIntentId.trim();
  }
  return fallback;
}

function buildPaymentPayload(
  operation: PaymentWriteOperation,
  payload: PaymentPayload,
): PaymentPayload {
  switch (operation) {
    case 'set_processing': {
      const paymentIntentId = readRequiredPaymentIntentId(payload);
      const stripePaymentIntentId = readStripePaymentIntentId(payload, paymentIntentId);
      return {
        status: 'payment_processing',
        paymentStatus: 'processing',
        paymentIntentId,
        stripePaymentIntentId,
        updatedAt: serverTimestamp(),
      };
    }
    case 'set_paid': {
      const paymentIntentId = readRequiredPaymentIntentId(payload);
      const stripePaymentIntentId = readStripePaymentIntentId(payload, paymentIntentId);
      return {
        status: 'pending_driver',
        paymentStatus: 'paid',
        deliveryStatus: 'waiting_driver',
        paymentIntentId,
        stripePaymentIntentId,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
    }
    case 'set_failed':
      return {
        status: 'awaiting_payment',
        paymentStatus: 'failed',
        paymentFailedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
    case 'set_unpaid':
      return {
        paymentStatus: 'unpaid',
        updatedAt: serverTimestamp(),
      };
    default: {
      const exhaustiveCheck: never = operation;
      throw new Error(`Unsupported payment operation: ${String(exhaustiveCheck)}`);
    }
  }
}

function cleanPaymentUpdate(payload: PaymentPayload): PaymentPayload {
  const cleaned: PaymentPayload = {};
  for (const key of PAYMENT_UPDATE_ALLOWED_KEYS) {
    if (payload[key] !== undefined) {
      cleaned[key] = payload[key];
    }
  }
  return cleaned;
}

export async function assertPaymentOrderOwnership(orderId: string): Promise<void> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid) throw new Error('Please sign in to complete payment');
  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) throw new Error('Missing order id');
  const ref = doc(db, 'orders', trimmedOrderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found');

  const ownerUid = ownerUidFromOrder(snap.data());
  if (!ownerUid || ownerUid !== uid) {
    throw new Error('You can only update payment state for your own order.');
  }
}

export async function updatePaymentOrderWithRetry(
  input: PaymentWriteInput,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid) throw new Error('Please sign in to complete payment');

  const orderId = input.orderId.trim();
  if (!orderId) throw new Error('Missing order id');

  await auth.currentUser?.getIdToken(true);
  await assertPaymentOrderOwnership(orderId);

  const path = `orders/${orderId}`;
  const payload = buildPaymentPayload(input.operation, input.payload);
  const safePayload = cleanPaymentUpdate(payload);
  console.log('PAYMENT WRITE KEYS', Object.keys(payload));
  console.log('PAYMENT WRITE PAYLOAD', payload);
  console.log('PAYMENT SAFE KEYS', Object.keys(safePayload));

  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    logPaymentWriteStart(input.operation, path, uid, safePayload);
    try {
      await updateDoc(doc(db, 'orders', orderId), safePayload);
      logPaymentWriteSuccess(input.operation, path, uid);
      return;
    } catch (error) {
      logPaymentWriteFail(input.operation, path, uid, safePayload, error);
      if (!isRetryableFirestoreError(error) || attempt >= 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}
