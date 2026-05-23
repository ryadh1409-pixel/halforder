import { safeListenerError } from '@/utils/safeFirestoreListener';
import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

type Unsubscribe = () => void;

const noopUnsub: Unsubscribe = () => {};

/**
 * Safe document snapshot — never throws from subscribe; cleanup is always safe.
 */
export function safeOnSnapshotDoc(
  ref: DocumentReference,
  onNext: (snap: DocumentSnapshot) => void,
  onError?: (error: FirestoreError) => void,
  context = 'firestore.doc',
): Unsubscribe {
  try {
    return onSnapshot(ref, onNext, safeListenerError(context, onError));
  } catch (error) {
    console.error(`[${context}] onSnapshot setup failed`, error);
    safeListenerError(context, onError)(error as FirestoreError);
    return noopUnsub;
  }
}

/**
 * Safe query snapshot — never throws from subscribe; cleanup is always safe.
 */
export function safeOnSnapshotQuery(
  query: Query,
  onNext: (snap: QuerySnapshot) => void,
  onError?: (error: FirestoreError) => void,
  context = 'firestore.query',
): Unsubscribe {
  try {
    return onSnapshot(query, onNext, safeListenerError(context, onError));
  } catch (error) {
    console.error(`[${context}] onSnapshot setup failed`, error);
    safeListenerError(context, onError)(error as FirestoreError);
    return noopUnsub;
  }
}

/** Invoke unsubscribe without throwing (for effect cleanups). */
export function safeUnsubscribe(unsub: Unsubscribe | undefined, context: string): void {
  if (!unsub) return;
  try {
    unsub();
  } catch (error) {
    if (__DEV__) {
      console.warn(`[${context}] unsubscribe failed`, error);
    }
  }
}
