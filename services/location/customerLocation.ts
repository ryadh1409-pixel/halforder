import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import type { CustomerLocationRecord, DeliveryAddressBundle } from '@/types/location';
import type { SavedLocation } from '@/types/savedLocation';
import { auth, db } from '@/services/firebase';

import { buildCustomerLocationRecord } from './customerLocationRecord';
import { resolveDeliveryLocationForOrder } from './productionGps';

export { buildCustomerLocationRecord } from './customerLocationRecord';

/** Persist latest customer GPS on `users/{uid}` (coordinates only). */
export async function persistCustomerLocation(
  userId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      customerLocation: buildCustomerLocationRecord(latitude, longitude),
      latitude,
      longitude,
      lastLocationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type ResolveDeliveryLocationOptions = {
  required?: boolean;
  persistToProfile?: boolean;
  /** Omit to load from Firestore; pass `null` to skip saved profile fallback. */
  savedProfile?: SavedLocation | null;
  manual?: SavedLocation | null;
};

/**
 * Resolve delivery coordinates for checkout — live GPS first, never stale profile-only.
 */
export async function resolveDeliveryLocationForCheckout(
  options: ResolveDeliveryLocationOptions = {},
): Promise<DeliveryAddressBundle> {
  const uid = auth.currentUser?.uid?.trim() ?? '';
  return resolveDeliveryLocationForOrder({
    required: options.required !== false,
    persistToProfile: options.persistToProfile !== false,
    userId: uid,
    savedProfile: options.savedProfile,
    manual: options.manual ?? null,
  });
}
