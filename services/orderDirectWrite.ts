/**
 * All direct Firestore `orders/{id}` writes must go through here or orderFirestoreWrite.
 * Logs [LEGACY ORDER WRITE] for lifecycle fields to catch non-gateway writers.
 */
import {
  doc,
  setDoc,
  updateDoc,
  type DocumentReference,
  type SetOptions,
  type Transaction,
  type UpdateData,
  type WithFieldValue,
} from 'firebase/firestore';

import { traceLegacyOrderWrite } from '@/lib/legacyOrderWriteTrace';
import { db } from '@/services/firebase';

export function orderDocRef(orderId: string): DocumentReference {
  return doc(db, 'orders', orderId.trim());
}

export async function directUpdateOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: string,
): Promise<void> {
  traceLegacyOrderWrite(source, orderId, patch);
  await updateDoc(orderDocRef(orderId), patch as UpdateData<Record<string, unknown>>);
}

export async function directSetOrder(
  orderId: string,
  patch: Record<string, unknown>,
  source: string,
  options?: SetOptions,
): Promise<void> {
  traceLegacyOrderWrite(source, orderId, patch);
  if (options) {
    await setDoc(orderDocRef(orderId), patch, options);
  } else {
    await setDoc(orderDocRef(orderId), patch);
  }
}

export function directTransactionUpdateOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: string,
): void {
  traceLegacyOrderWrite(source, ref.id, patch);
  tx.update(ref, patch as WithFieldValue<Record<string, unknown>>);
}

export function directTransactionSetOrder(
  tx: Transaction,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  source: string,
  options?: { merge?: boolean },
): void {
  traceLegacyOrderWrite(source, ref.id, patch);
  if (options?.merge) {
    tx.set(ref, patch, { merge: true });
  } else {
    tx.set(ref, patch);
  }
}
