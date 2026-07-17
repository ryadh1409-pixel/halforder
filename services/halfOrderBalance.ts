import { auth, db } from '@/services/firebase';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const BALANCE_FIELD = 'halfOrderBalance';
const LEGACY_FIELD = 'walletBalance';

export function parseHalfOrderBalance(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const primary = data[BALANCE_FIELD];
  if (typeof primary === 'number' && Number.isFinite(primary)) {
    return Math.round(primary * 100) / 100;
  }
  const legacy = data[LEGACY_FIELD];
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    return Math.round(legacy * 100) / 100;
  }
  return 0;
}

export function subscribeHalfOrderBalance(
  uid: string,
  onData: (balance: number) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(parseHalfOrderBalance(snap.data() as Record<string, unknown> | undefined));
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load balance'));
      onData(0);
    },
  );
}

/**
 * Admin-only: add or remove balance. Positive delta adds; negative removes.
 * Writes ledger entry for audit.
 */
export async function adminAdjustHalfOrderBalance(input: {
  userId: string;
  delta: number;
  reason?: string;
}): Promise<number> {
  const adminUid = auth.currentUser?.uid ?? '';
  if (!adminUid) throw new Error('Sign in required');
  const userId = input.userId.trim();
  if (!userId) throw new Error('User id required');
  const delta = Math.round(input.delta * 100) / 100;
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a non-zero amount');
  }

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  const current = parseHalfOrderBalance(snap.data() as Record<string, unknown>);
  const next = Math.round((current + delta) * 100) / 100;
  if (next < 0) throw new Error('Balance cannot go below $0.00');

  await updateDoc(userRef, {
    [BALANCE_FIELD]: next,
    [LEGACY_FIELD]: next,
    updatedAt: serverTimestamp(),
  });

  const ledgerRef = doc(collection(db, 'balanceLedger'));
  await setDoc(ledgerRef, {
    userId,
    delta,
    previousBalance: current,
    nextBalance: next,
    reason:
      typeof input.reason === 'string' && input.reason.trim()
        ? input.reason.trim()
        : null,
    adminUid,
    createdAt: serverTimestamp(),
  });

  return next;
}
