/**
 * Single client gateway for Firestore `orders/{orderId}` writes.
 * All marketplace lifecycle patches should go through `protectedUpdateOrder`.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Transaction,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';

import { traceOrderWriteFromPatch } from '@/lib/orderWriteTrace';
import { deriveOrderStage, sanitizeOrderPatchAgainstRegression } from '@/services/orderStage';
import { db } from '@/services/firebase';

export type OrderWriteSource = {
  fileName: string;
  functionName: string;
};

function orderRef(orderId: string): DocumentReference {
  return doc(db, 'orders', orderId.trim());
}

/** Read → sanitize → traced update (marketplace lifecycle). */
export async function protectedUpdateOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Order id is required');

  const ref = orderRef(trimmed);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Order not found');

  const current = snap.data() as Record<string, unknown>;
  const currentInput = { id: trimmed, ...current };
  const safePatch = sanitizeOrderPatchAgainstRegression(currentInput, {
    ...patch,
    updatedAt: patch.updatedAt ?? serverTimestamp(),
  });

  traceOrderWriteFromPatch(source.fileName, source.functionName, trimmed, safePatch, {
    op: 'update',
  });

  if (Object.keys(safePatch).length === 0) {
    if (__DEV__) {
      console.warn('[ORDER WRITE TRACE] skipped empty protected patch', {
        orderId: trimmed,
        source,
        requested: patch,
      });
    }
    return;
  }

  if (__DEV__) {
    console.log('[ORDER STAGE] protected patch', {
      orderId: trimmed,
      beforeStage: deriveOrderStage(currentInput),
      afterStage: deriveOrderStage({ ...currentInput, ...safePatch }),
      fields: Object.keys(safePatch),
      source,
    });
  }

  await updateDoc(ref, safePatch as UpdateData<Record<string, unknown>>);
}

/** Traced partial update without lifecycle sanitization (visibility, driver pin, etc.). */
export async function rawUpdateOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Order id is required');

  traceOrderWriteFromPatch(source.fileName, source.functionName, trimmed, patch, {
    op: 'update',
  });
  await updateDoc(orderRef(trimmed), patch as UpdateData<Record<string, unknown>>);
}

export async function tracedSetOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
  options?: { merge?: boolean },
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Order id is required');

  traceOrderWriteFromPatch(source.fileName, source.functionName, trimmed, patch, {
    op: 'set',
    merge: options?.merge ?? false,
  });

  if (options?.merge) {
    await setDoc(orderRef(trimmed), patch, { merge: true });
  } else {
    await setDoc(orderRef(trimmed), patch);
  }
}

export async function tracedAddOrder(
  payload: Record<string, unknown>,
  source: OrderWriteSource,
): Promise<string> {
  traceOrderWriteFromPatch(source.fileName, source.functionName, '(new-doc)', payload, {
    op: 'add',
  });
  const ref = await addDoc(collection(db, 'orders'), payload);
  return ref.id;
}

export function tracedTransactionUpdateOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): void {
  traceOrderWriteFromPatch(source.fileName, source.functionName, ref.id, patch, {
    op: 'transaction-update',
  });
  tx.update(ref, patch as WithFieldValue<Record<string, unknown>>);
}

export function tracedTransactionSetOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
  options?: { merge?: boolean },
): void {
  traceOrderWriteFromPatch(source.fileName, source.functionName, ref.id, patch, {
    op: 'transaction-set',
    merge: options?.merge ?? false,
  });
  if (options?.merge) {
    tx.set(ref, patch, { merge: true });
  } else {
    tx.set(ref, patch);
  }
}
