import { doc, getDoc, type DocumentData } from 'firebase/firestore';
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

import {
  buildOrderPaidStatePatch,
  needsPaidStatusRepair,
  POST_PAYMENT_ORDER_STATUS,
} from '@/lib/orderPaidState';

/**
 * Order payment fields (`status`, `paymentStatus`, `paymentIntentId`, `paidAt`, etc.)
 * are updated only by the Stripe webhook (Admin SDK). Client writes cause duplicate
 * updates and Firestore permission errors.
 */
const CLIENT_PAYMENT_STATE_WRITES_ENABLED = false;

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

/**
 * Legacy client payment patches — disabled; rely on Stripe webhook + realtime listeners.
 */
export async function updatePaymentOrderWithRetry(
  input: PaymentWriteInput,
): Promise<void> {
  if (!CLIENT_PAYMENT_STATE_WRITES_ENABLED) {
    if (__DEV__) {
      console.log(
        '[PAYMENT FS SKIP] Client payment writes disabled; webhook owns payment state.',
        { operation: input.operation, orderId: input.orderId },
      );
    }
    return;
  }

  throw new Error(
    'Client payment Firestore writes are disabled. Payment state is synced via Stripe webhook.',
  );
}

/**
 * Documents the canonical paid transition (webhook / Cloud Function only).
 * Client must never call this — use for logging and server-side handlers.
 */
export function describeOrderPaidStatePatch(
  existing: Record<string, unknown>,
  extras?: Parameters<typeof buildOrderPaidStatePatch>[1],
): Record<string, unknown> {
  return buildOrderPaidStatePatch(existing, extras);
}

/** Dev-only: log when Firestore has split paid/status (webhook repair will fix). */
export function logPaidStatusRepairIfNeeded(
  orderId: string,
  order: Record<string, unknown>,
): void {
  if (!needsPaidStatusRepair(order)) return;
  console.warn('[PAYMENT REPAIR NEEDED] paid but status still pre-payment', {
    orderId,
    paymentStatus: order.paymentStatus,
    status: order.status,
    expectedStatus: POST_PAYMENT_ORDER_STATUS,
  });
}
