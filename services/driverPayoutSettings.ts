import { auth, db } from '@/services/firebase';
import { DEFAULT_DRIVER_PAYOUT_PERCENT } from '@/lib/driverEarnings';
import {
  getCachedDriverPayoutPercent,
  setCachedDriverPayoutPercent,
} from '@/lib/driverPayoutPercentCache';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const DOC_PATH = ['platformSettings', 'fees'] as const;

let sharedUnsub: Unsubscribe | null = null;
let sharedSubscribers = 0;
const localListeners = new Set<(percent: number) => void>();

function emit(percent: number): void {
  const next = setCachedDriverPayoutPercent(percent);
  for (const fn of localListeners) fn(next);
}

function ensureSharedListener(): void {
  if (sharedUnsub) return;
  sharedUnsub = onSnapshot(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    (snap) => {
      emit(snap.data()?.driverPayoutPercent ?? DEFAULT_DRIVER_PAYOUT_PERCENT);
    },
    () => {
      /* keep last known / default */
    },
  );
}

export { getCachedDriverPayoutPercent };

/**
 * Subscribe to the global driver payout percentage (0–100).
 * Shares one Firestore listener across the app.
 */
export function subscribeDriverPayoutPercent(
  onData: (percent: number) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  sharedSubscribers += 1;
  ensureSharedListener();
  localListeners.add(onData);
  onData(getCachedDriverPayoutPercent());

  return () => {
    localListeners.delete(onData);
    sharedSubscribers = Math.max(0, sharedSubscribers - 1);
    if (sharedSubscribers === 0 && sharedUnsub) {
      sharedUnsub();
      sharedUnsub = null;
    }
    void onError;
  };
}

/** One-shot read (also refreshes cache). */
export async function loadDriverPayoutPercent(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
    const percent = setCachedDriverPayoutPercent(
      snap.data()?.driverPayoutPercent ?? DEFAULT_DRIVER_PAYOUT_PERCENT,
    );
    for (const fn of localListeners) fn(percent);
    return percent;
  } catch {
    return getCachedDriverPayoutPercent();
  }
}

export async function saveDriverPayoutPercent(percent: number): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const next = setCachedDriverPayoutPercent(percent);
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    {
      driverPayoutPercent: next,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );
  for (const fn of localListeners) fn(next);
}
