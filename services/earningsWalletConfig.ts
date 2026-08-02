/**
 * Admin-configurable earnings wallet rates.
 * Changes apply to future order credits only (CF reads config at credit time).
 */

import { db } from '@/services/firebase';
import {
  DEFAULT_EARNINGS_WALLET_CONFIG,
  type EarningsWalletConfig,
} from '@/types/earningsWallet';
import { normalizeEarningsWalletConfig } from '@/lib/earningsWalletMath';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export const EARNINGS_WALLET_CONFIG_PATH = {
  collection: 'platformSettings',
  doc: 'earningsWalletConfig',
} as const;

let cachedConfig: EarningsWalletConfig = { ...DEFAULT_EARNINGS_WALLET_CONFIG };

export function getCachedEarningsWalletConfig(): EarningsWalletConfig {
  return { ...cachedConfig };
}

export async function fetchEarningsWalletConfig(): Promise<EarningsWalletConfig> {
  const ref = doc(
    db,
    EARNINGS_WALLET_CONFIG_PATH.collection,
    EARNINGS_WALLET_CONFIG_PATH.doc,
  );
  const snap = await getDoc(ref);
  const next = normalizeEarningsWalletConfig(
    snap.exists() ? (snap.data() as Partial<EarningsWalletConfig>) : null,
  );
  cachedConfig = next;
  return next;
}

export function subscribeEarningsWalletConfig(
  onChange: (config: EarningsWalletConfig) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const ref = doc(
    db,
    EARNINGS_WALLET_CONFIG_PATH.collection,
    EARNINGS_WALLET_CONFIG_PATH.doc,
  );
  return onSnapshot(
    ref,
    (snap) => {
      const next = normalizeEarningsWalletConfig(
        snap.exists() ? (snap.data() as Partial<EarningsWalletConfig>) : null,
      );
      cachedConfig = next;
      onChange(next);
    },
    (err) => onError?.(err),
  );
}

/** Admin-only write (enforced by Firestore rules). */
export async function saveEarningsWalletConfig(
  patch: Partial<EarningsWalletConfig>,
  adminUid: string,
): Promise<EarningsWalletConfig> {
  const current = await fetchEarningsWalletConfig();
  const merged = normalizeEarningsWalletConfig({ ...current, ...patch });
  const ref = doc(
    db,
    EARNINGS_WALLET_CONFIG_PATH.collection,
    EARNINGS_WALLET_CONFIG_PATH.doc,
  );
  await setDoc(
    ref,
    {
      ...merged,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    },
    { merge: true },
  );
  cachedConfig = merged;
  return merged;
}
