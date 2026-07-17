import { DEFAULT_TAX_RATE } from '@/lib/orderPricing';
import { auth, db } from '@/services/firebase';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type PlatformFeeSettings = {
  defaultTaxRate: number;
};

const DOC_PATH = ['platformSettings', 'fees'] as const;

export function parseTaxRate(raw: unknown, fallback = DEFAULT_TAX_RATE): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseFloat(raw.trim());
    if (Number.isFinite(n)) {
      if (n > 1) return Math.min(1, Math.max(0, n / 100));
      return Math.min(1, Math.max(0, n));
    }
  }
  return fallback;
}

export function subscribePlatformFeeSettings(
  onData: (settings: PlatformFeeSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    (snap) => {
      const data = snap.data() as Record<string, unknown> | undefined;
      onData({
        defaultTaxRate: parseTaxRate(data?.defaultTaxRate, DEFAULT_TAX_RATE),
      });
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load fee settings'));
      onData({ defaultTaxRate: DEFAULT_TAX_RATE });
    },
  );
}

export async function savePlatformDefaultTaxRate(
  taxRate: number,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const rate = parseTaxRate(taxRate, DEFAULT_TAX_RATE);
  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    {
      defaultTaxRate: rate,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );
}

/** Read tax rate from restaurant doc, else platform default, else 13%. */
export function resolveRestaurantTaxRate(
  restaurantData: Record<string, unknown> | null | undefined,
  platformDefault: number = DEFAULT_TAX_RATE,
): number {
  if (!restaurantData) return parseTaxRate(platformDefault);
  if ('taxRate' in restaurantData) {
    return parseTaxRate(restaurantData.taxRate, platformDefault);
  }
  return parseTaxRate(platformDefault);
}

export function resolveRestaurantServiceFeeAmount(
  restaurantData: Record<string, unknown> | null | undefined,
): number | null {
  if (!restaurantData) return null;
  const raw = restaurantData.serviceFee;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  return null;
}

export function resolveRestaurantDeliveryFeeOverride(
  restaurantData: Record<string, unknown> | null | undefined,
): number | null {
  if (!restaurantData) return null;
  const raw = restaurantData.deliveryFee;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  return null;
}
