/**
 * Single client gateway for Firestore `orders/{orderId}` writes.
 * All marketplace lifecycle mutations MUST use protectedUpdateOrder or
 * protectedTransactionUpdateOrder.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Transaction,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';

import { traceLegacyOrderWrite } from '@/lib/legacyOrderWriteTrace';
import { wouldDowngradeLifecycle } from '@/lib/orderLifecyclePriority';
import { traceOrderLifecycleWrite, traceOrderWriteFromPatch } from '@/lib/orderWriteTrace';
import {
  deriveOrderStage,
  sanitizeOrderPatchAgainstRegression,
  type OrderStageInput,
} from '@/services/orderStage';
import { db } from '@/services/firebase';

export type OrderWriteSource = {
  fileName: string;
  functionName: string;
};

function orderRef(orderId: string): DocumentReference {
  return doc(db, 'orders', orderId.trim());
}

function sourceLabel(source: OrderWriteSource): string {
  return `${source.fileName}#${source.functionName}`;
}

/** Strip lifecycle fields that would move backward; log blocked downgrades. */
export function prepareProtectedOrderPatch(
  orderId: string,
  current: OrderStageInput,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Record<string, unknown> {
  const trimmed = orderId.trim();
  const currentInput = { id: trimmed, ...current };
  const withUpdatedAt = {
    ...patch,
    updatedAt: patch.updatedAt ?? serverTimestamp(),
    updatedBy: patch.updatedBy ?? `${source.fileName}#${source.functionName}`,
  };

  if (wouldDowngradeLifecycle(currentInput, withUpdatedAt)) {
    const incomingStatus =
      typeof withUpdatedAt.status === 'string' ? withUpdatedAt.status : '(patch)';
    if (__DEV__) {
      console.warn('[ORDER DOWNGRADE BLOCKED]', trimmed, current.status ?? null, incomingStatus, {
        source: sourceLabel(source),
        deliveryStatus: withUpdatedAt.deliveryStatus ?? null,
      });
    }
    const stripped = { ...withUpdatedAt };
    delete stripped.status;
    delete stripped.deliveryStatus;
    delete stripped.paymentStatus;
    return sanitizeOrderPatchAgainstRegression(currentInput, stripped);
  }

  return sanitizeOrderPatchAgainstRegression(currentInput, withUpdatedAt);
}

function tracePreparedPatch(
  orderId: string,
  current: OrderStageInput,
  requested: Record<string, unknown>,
  safePatch: Record<string, unknown>,
  source: OrderWriteSource,
): void {
  const trimmed = orderId.trim();
  const currentInput = { id: trimmed, ...current };
  traceOrderLifecycleWrite({
    source: sourceLabel(source),
    orderId: trimmed,
    beforeStatus: current.status ?? null,
    incomingPatch: requested,
    afterStatus: safePatch.status ?? current.status ?? null,
    beforeStage: deriveOrderStage(currentInput),
    afterStage: deriveOrderStage({ ...currentInput, ...safePatch }),
    hasPendingWrites: false,
  });
}

/** Read → monotonic guard → sanitize → traced update. */
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
  const safePatch = prepareProtectedOrderPatch(trimmed, currentInput, patch, source);

  tracePreparedPatch(trimmed, currentInput, patch, safePatch, source);

  if (Object.keys(safePatch).length === 0) {
    return;
  }

  await updateDoc(ref, safePatch as UpdateData<Record<string, unknown>>);
}

/** Transactional lifecycle write with the same monotonic protection. */
export async function protectedTransactionUpdateOrder(
  orderId: string,
  buildPatch: (current: Record<string, unknown>) => Record<string, unknown> | null,
  source: OrderWriteSource,
): Promise<boolean> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Order id is required');

  let wrote = false;
  await runTransaction(db, async (tx) => {
    const ref = orderRef(trimmed);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Order not found');

    const current = snap.data() as Record<string, unknown>;
    const currentInput = { id: trimmed, ...current };
    const requested = buildPatch(current);
    if (!requested) return;

    const safePatch = prepareProtectedOrderPatch(trimmed, currentInput, requested, source);
    tracePreparedPatch(trimmed, currentInput, requested, safePatch, source);

    if (Object.keys(safePatch).length === 0) return;

    tx.update(ref, safePatch as WithFieldValue<Record<string, unknown>>);
    wrote = true;
  });

  return wrote;
}

/** Non-lifecycle fields only (archive flags, driverLocation, typing, etc.). */
export async function rawUpdateOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Order id is required');

  traceLegacyOrderWrite(sourceLabel(source), trimmed, patch);
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

  traceLegacyOrderWrite(sourceLabel(source), trimmed, patch);
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

/** @deprecated Use protectedTransactionUpdateOrder — still sanitizes patch. */
export function tracedTransactionUpdateOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
  current?: Record<string, unknown>,
): void {
  const orderId = ref.id;
  const currentInput = { id: orderId, ...(current ?? {}) };
  const safePatch = prepareProtectedOrderPatch(orderId, currentInput, patch, source);
  tracePreparedPatch(orderId, currentInput, patch, safePatch, source);
  if (Object.keys(safePatch).length === 0) return;
  tx.update(ref, safePatch as WithFieldValue<Record<string, unknown>>);
}

export function tracedTransactionSetOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
  options?: { merge?: boolean },
): void {
  traceLegacyOrderWrite(sourceLabel(source), ref.id, patch);
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
