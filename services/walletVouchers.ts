/**
 * Wallet vouchers — reuses existing `promoCodes` collection (no schema/rules change).
 * Redeemed vouchers are stored on `users/{uid}.redeemedVouchers` for future checkout use.
 */
import {
  applyPromoCode,
  subscribePromoCodes,
  type PromoCodeDoc,
} from '@/services/promoCodes';
import { auth, db } from '@/services/firebase';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type WalletRedeemedVoucher = {
  code: string;
  promoId: string;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  redeemedAtMs: number;
  status: 'redeemed';
};

function parseRedeemed(raw: unknown): WalletRedeemedVoucher[] {
  if (!Array.isArray(raw)) return [];
  const out: WalletRedeemedVoucher[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const code = typeof r.code === 'string' ? r.code.trim().toUpperCase() : '';
    const promoId = typeof r.promoId === 'string' ? r.promoId.trim() : '';
    if (!code || !promoId) continue;
    out.push({
      code,
      promoId,
      discountType: r.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue:
        typeof r.discountValue === 'number' && Number.isFinite(r.discountValue)
          ? r.discountValue
          : 0,
      redeemedAtMs:
        typeof r.redeemedAtMs === 'number' && Number.isFinite(r.redeemedAtMs)
          ? r.redeemedAtMs
          : 0,
      status: 'redeemed',
    });
  }
  return out;
}

export function subscribeWalletRedeemedVouchers(
  uid: string,
  onData: (rows: WalletRedeemedVoucher[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const data = snap.data() as Record<string, unknown> | undefined;
      onData(parseRedeemed(data?.redeemedVouchers));
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load vouchers'));
      onData([]);
    },
  );
}

export function subscribeActiveVoucherCatalog(
  onData: (rows: PromoCodeDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribePromoCodes((rows) => {
    const now = Date.now();
    onData(
      rows.filter(
        (r) =>
          r.active &&
          (r.expiresAtMs == null || r.expiresAtMs > now) &&
          (r.usageLimit == null || r.usedCount < r.usageLimit),
      ),
    );
  }, onError);
}

/** Validate + attach voucher to the signed-in user's wallet for later use. */
export async function redeemVoucherToWallet(
  code: string,
): Promise<WalletRedeemedVoucher> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid || auth.currentUser?.isAnonymous) {
    throw new Error('Sign in required');
  }

  const applied = await applyPromoCode({
    code,
    foodSubtotal: 100,
  });

  let discountType: 'fixed' | 'percent' = 'fixed';
  let discountValue = applied.discountAmount;

  const q = query(
    collection(db, 'promoCodes'),
    where('code', '==', applied.code),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0]!.data() as Record<string, unknown>;
    discountType = d.discountType === 'percent' ? 'percent' : 'fixed';
    discountValue =
      typeof d.discountValue === 'number' && Number.isFinite(d.discountValue)
        ? d.discountValue
        : applied.discountAmount;
  } else {
    const byId = await getDoc(doc(db, 'promoCodes', applied.promoId));
    if (byId.exists()) {
      const d = byId.data() as Record<string, unknown>;
      discountType = d.discountType === 'percent' ? 'percent' : 'fixed';
      discountValue =
        typeof d.discountValue === 'number' && Number.isFinite(d.discountValue)
          ? d.discountValue
          : applied.discountAmount;
    }
  }

  const entry: WalletRedeemedVoucher = {
    code: applied.code,
    promoId: applied.promoId,
    discountType,
    discountValue,
    redeemedAtMs: Date.now(),
    status: 'redeemed',
  };

  await setDoc(
    doc(db, 'users', uid),
    {
      redeemedVouchers: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return entry;
}

export function formatVoucherValue(v: {
  discountType: 'fixed' | 'percent';
  discountValue: number;
}): string {
  return v.discountType === 'percent'
    ? `${v.discountValue}% off`
    : `$${v.discountValue.toFixed(2)} off`;
}
