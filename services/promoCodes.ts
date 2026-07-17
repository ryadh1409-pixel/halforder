import { auth, db } from '@/services/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type PromoDiscountType = 'fixed' | 'percent';

export type PromoCodeDoc = {
  id: string;
  code: string;
  discountType: PromoDiscountType;
  /** Fixed dollars or percent (0–100). */
  discountValue: number;
  active: boolean;
  expiresAtMs: number | null;
  usageLimit: number | null;
  usedCount: number;
  /** Empty = all restaurants. */
  restaurantIds: string[];
  description: string;
};

function normCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function parsePromo(id: string, data: Record<string, unknown>): PromoCodeDoc {
  const discountType: PromoDiscountType =
    data.discountType === 'percent' ? 'percent' : 'fixed';
  const expiresAt = data.expiresAt;
  let expiresAtMs: number | null = null;
  if (expiresAt && typeof expiresAt === 'object' && 'toMillis' in expiresAt) {
    expiresAtMs = (expiresAt as { toMillis: () => number }).toMillis();
  } else if (typeof expiresAt === 'number') {
    expiresAtMs = expiresAt;
  }
  const restaurantIds = Array.isArray(data.restaurantIds)
    ? data.restaurantIds.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id,
    code: normCode(typeof data.code === 'string' ? data.code : id),
    discountType,
    discountValue:
      typeof data.discountValue === 'number' && Number.isFinite(data.discountValue)
        ? data.discountValue
        : 0,
    active: data.active !== false,
    expiresAtMs,
    usageLimit:
      typeof data.usageLimit === 'number' && Number.isFinite(data.usageLimit)
        ? Math.max(0, Math.floor(data.usageLimit))
        : null,
    usedCount:
      typeof data.usedCount === 'number' && Number.isFinite(data.usedCount)
        ? Math.max(0, Math.floor(data.usedCount))
        : 0,
    restaurantIds,
    description:
      typeof data.description === 'string' ? data.description.trim() : '',
  };
}

export function subscribePromoCodes(
  onData: (rows: PromoCodeDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'promoCodes'),
    (snap) => {
      const rows = snap.docs.map((d) =>
        parsePromo(d.id, d.data() as Record<string, unknown>),
      );
      rows.sort((a, b) => a.code.localeCompare(b.code));
      onData(rows);
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load promos'));
      onData([]);
    },
  );
}

export async function savePromoCode(input: {
  id?: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  active: boolean;
  expiresAtMs: number | null;
  usageLimit: number | null;
  restaurantIds: string[];
  description?: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const code = normCode(input.code);
  if (!code) throw new Error('Promo code required');
  if (!(input.discountValue > 0)) throw new Error('Discount value must be > 0');
  if (input.discountType === 'percent' && input.discountValue > 100) {
    throw new Error('Percent cannot exceed 100');
  }

  const id = input.id?.trim() || code.toLowerCase();
  const ref = doc(db, 'promoCodes', id);
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    {
      code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      active: input.active === true,
      expiresAt: input.expiresAtMs,
      usageLimit: input.usageLimit,
      usedCount: existing.exists()
        ? (existing.data()?.usedCount ?? 0)
        : 0,
      restaurantIds: input.restaurantIds,
      description: input.description?.trim() ?? '',
      updatedAt: serverTimestamp(),
      ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
  return id;
}

export async function setPromoCodeActive(
  id: string,
  active: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'promoCodes', id), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePromoCode(id: string): Promise<void> {
  await deleteDoc(doc(db, 'promoCodes', id));
}

/** Mark a promo as sent (admin broadcast tracking). */
export async function markPromoCodeSent(id: string): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  await updateDoc(doc(db, 'promoCodes', id), {
    lastSentAt: serverTimestamp(),
    lastSentBy: uid || null,
    updatedAt: serverTimestamp(),
  });
}

export type AppliedPromo = {
  code: string;
  discountAmount: number;
  promoId: string;
};

export function computePromoDiscountAmount(
  promo: PromoCodeDoc,
  foodSubtotal: number,
): number {
  if (foodSubtotal <= 0) return 0;
  if (promo.discountType === 'percent') {
    return Math.round(foodSubtotal * (promo.discountValue / 100) * 100) / 100;
  }
  return Math.min(foodSubtotal, Math.round(promo.discountValue * 100) / 100);
}

export function isPromoCurrentlyValid(
  promo: PromoCodeDoc,
  restaurantId?: string | null,
): string | null {
  if (!promo.active) return 'This promo is inactive.';
  if (promo.expiresAtMs != null && promo.expiresAtMs <= Date.now()) {
    return 'This promo has expired.';
  }
  if (
    promo.usageLimit != null &&
    promo.usedCount >= promo.usageLimit
  ) {
    return 'This promo has reached its usage limit.';
  }
  if (
    promo.restaurantIds.length > 0 &&
    restaurantId &&
    !promo.restaurantIds.includes(restaurantId)
  ) {
    return 'This promo is not valid for this restaurant.';
  }
  return null;
}

/** Client-side apply: looks up code and returns discount for food subtotal. */
export async function applyPromoCode(input: {
  code: string;
  foodSubtotal: number;
  restaurantId?: string | null;
}): Promise<AppliedPromo> {
  const code = normCode(input.code);
  if (!code) throw new Error('Enter a promo code');

  const q = query(collection(db, 'promoCodes'), where('code', '==', code));
  const snap = await getDocs(q);
  if (snap.empty) {
    // Try doc id = lowercased code
    const byId = await getDoc(doc(db, 'promoCodes', code.toLowerCase()));
    if (!byId.exists()) throw new Error('Promo code not found');
    const promo = parsePromo(byId.id, byId.data() as Record<string, unknown>);
    const err = isPromoCurrentlyValid(promo, input.restaurantId);
    if (err) throw new Error(err);
    return {
      code: promo.code,
      promoId: promo.id,
      discountAmount: computePromoDiscountAmount(promo, input.foodSubtotal),
    };
  }
  const d = snap.docs[0]!;
  const promo = parsePromo(d.id, d.data() as Record<string, unknown>);
  const err = isPromoCurrentlyValid(promo, input.restaurantId);
  if (err) throw new Error(err);
  return {
    code: promo.code,
    promoId: promo.id,
    discountAmount: computePromoDiscountAmount(promo, input.foodSubtotal),
  };
}
