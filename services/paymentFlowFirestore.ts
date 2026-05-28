import { auth, db } from './firebase';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';

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
  const payload = { ...input.payload, updatedAt: serverTimestamp() };

  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    logPaymentWriteStart(input.operation, path, uid, payload);
    try {
      await updateDoc(doc(db, 'orders', orderId), payload);
      logPaymentWriteSuccess(input.operation, path, uid);
      return;
    } catch (error) {
      logPaymentWriteFail(input.operation, path, uid, payload, error);
      if (!isRetryableFirestoreError(error) || attempt >= 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}
