import { auth, db } from '@/services/firebase';
import { parseTaxRate } from '@/services/platformFees';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type RestaurantFeeRow = {
  id: string;
  name: string;
  deliveryFee: number | null;
  serviceFee: number | null;
  taxRate: number | null;
};

function numOrNull(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  return null;
}

export function subscribeRestaurantFeeRows(
  onData: (rows: RestaurantFeeRow[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'restaurants'),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const name =
          (typeof data.name === 'string' && data.name.trim()) ||
          (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
          'Restaurant';
        return {
          id: d.id,
          name,
          deliveryFee: numOrNull(data.deliveryFee),
          serviceFee: numOrNull(data.serviceFee),
          taxRate:
            data.taxRate != null ? parseTaxRate(data.taxRate, NaN) : null,
        } satisfies RestaurantFeeRow;
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      onData(
        rows.map((r) => ({
          ...r,
          taxRate: r.taxRate != null && Number.isFinite(r.taxRate) ? r.taxRate : null,
        })),
      );
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load restaurants'));
      onData([]);
    },
  );
}

export async function saveRestaurantFees(input: {
  restaurantId: string;
  deliveryFee: number;
  serviceFee: number;
  taxRate: number;
}): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const id = input.restaurantId.trim();
  if (!id) throw new Error('Restaurant id required');
  if (!(input.deliveryFee >= 0) || !(input.serviceFee >= 0)) {
    throw new Error('Fees must be 0 or greater');
  }
  const taxRate = parseTaxRate(input.taxRate);
  await updateDoc(doc(db, 'restaurants', id), {
    deliveryFee: Math.round(input.deliveryFee * 100) / 100,
    serviceFee: Math.round(input.serviceFee * 100) / 100,
    taxRate,
    updatedAt: serverTimestamp(),
  });
}
