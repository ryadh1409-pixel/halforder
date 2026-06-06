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
import { logOrderStatusTransition } from '@/lib/orderTerminalStatus';
import { traceOrderLifecycleWrite, traceOrderWriteFromPatch } from '@/lib/orderWriteTrace';
import {
  deriveOrderStage,
  sanitizeOrderPatchAgainstRegression,
  type OrderStageInput,
} from '@/services/orderStage';
import { auth, db } from '@/services/firebase';

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

function patchTouchesLifecycle(patch: Record<string, unknown>): boolean {
  return (
    patch.status !== undefined ||
    patch.deliveryStatus !== undefined ||
    patch.paymentStatus !== undefined
  );
}

function ensureUpdatedBy(
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Record<string, unknown> {
  if (!patchTouchesLifecycle(patch)) return patch;
  if (patch.updatedBy !== undefined && patch.updatedBy !== null) return patch;

  console.warn('[MISSING updatedBy]', {
    orderId: '(patch)',
    source: sourceLabel(source),
    patch,
  });
  return {
    ...patch,
    updatedBy: sourceLabel(source),
  };
}

/** Hard monotonic guard — rejects entire write when patch would regress lifecycle. */
export function prepareProtectedOrderPatch(
  orderId: string,
  current: OrderStageInput,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Record<string, unknown> {
  const trimmed = orderId.trim();
  const currentInput = { id: trimmed, ...current };
  const withMeta = ensureUpdatedBy(
    {
      ...patch,
      updatedAt: patch.updatedAt ?? serverTimestamp(),
      updatedBy:
        patch.updatedBy ?? `${source.fileName}#${source.functionName}`,
    },
    source,
  );

  if (wouldDowngradeLifecycle(currentInput, withMeta)) {
    console.warn('[ORDER DOWNGRADE BLOCKED]', {
      orderId: trimmed,
      currentStatus: current.status ?? null,
      incomingStatus: withMeta.status ?? null,
      currentDeliveryStatus: current.deliveryStatus ?? null,
      incomingDeliveryStatus: withMeta.deliveryStatus ?? null,
      source: sourceLabel(source),
    });
    return {};
  }

  const safe = sanitizeOrderPatchAgainstRegression(currentInput, withMeta);
  if (
    wouldDowngradeLifecycle(currentInput, safe) ||
    (safe.status !== undefined &&
      wouldDowngradeLifecycle(currentInput, { status: safe.status }))
  ) {
    console.warn('[ORDER DOWNGRADE BLOCKED]', {
      orderId: trimmed,
      reason: 'post_sanitize',
      source: sourceLabel(source),
    });
    return {};
  }

  return safe;
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

/** Read → monotonic guard → sanitize → traced update. @returns true when Firestore was updated. */
export async function protectedUpdateOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: OrderWriteSource,
): Promise<boolean> {
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
    console.warn('[FIRESTORE ORDER WRITE SKIPPED]', {
      documentPath: `orders/${trimmed}`,
      uid: auth.currentUser?.uid ?? null,
      orderId: trimmed,
      requestedPatch: patch,
      source: sourceLabel(source),
      rejectBranch:
        patch.status === 'cancelled' ?
          'client:prepareProtectedOrderPatch_empty — check ORDER DOWNGRADE BLOCKED or ORDER STAGE blocked regression'
        : 'client:prepareProtectedOrderPatch_empty',
    });
    return false;
  }

  const documentPath = `orders/${trimmed}`;
  console.log('[FIRESTORE ORDER WRITE]', {
    documentPath,
    uid: auth.currentUser?.uid ?? null,
    orderId: trimmed,
    payload: safePatch,
    source: sourceLabel(source),
  });

  if (safePatch.status !== undefined || safePatch.deliveryStatus !== undefined) {
    logOrderStatusTransition(trimmed, current.status ?? null, safePatch.status ?? current.status ?? null, {
      source: sourceLabel(source),
      previousDeliveryStatus: current.deliveryStatus ?? null,
      newDeliveryStatus: safePatch.deliveryStatus ?? current.deliveryStatus ?? null,
    });
  }

  await updateDoc(ref, safePatch as UpdateData<Record<string, unknown>>);
  return true;
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
