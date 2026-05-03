/**
 * Firestore profile for restaurant / food-truck hosts (`restaurants/{ownerId}`).
 */
import { db } from './firebase';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

/**
 * Primary venue write (Host save) — `setDoc` merge with `ownerId` and first-write `createdAt`.
 */
export async function saveRestaurantVenueMain(input: {
  uid: string;
  name: string;
  location: string;
  logo: string | null;
}): Promise<void> {
  const uid = input.uid.trim();
  if (!uid) throw new Error('Invalid owner id');
  const ref = doc(db, 'restaurants', uid);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      name: input.name.trim(),
      location: input.location.trim(),
      logo: input.logo,
      ownerId: uid,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: Date.now() }),
    },
    { merge: true },
  );
  try {
    await updateDoc(doc(db, 'users', uid), { restaurantId: uid });
  } catch {
    await setDoc(doc(db, 'users', uid), { restaurantId: uid }, { merge: true });
  }
}

export type HostRestaurantPatch = {
  name?: string;
  logo?: string | null;
  location?: string;
  /** Optional coordinates from device location picker */
  locationLat?: number | null;
  locationLng?: number | null;
  isOpen?: boolean;
};

/**
 * Merge host-visible fields on `restaurants/{ownerId}` and ensure `users/{ownerId}.restaurantId`.
 */
export async function mergeHostRestaurantProfile(
  ownerId: string,
  patch: HostRestaurantPatch,
): Promise<void> {
  const rid = ownerId.trim();
  if (!rid) throw new Error('Invalid owner id');

  const ref = doc(db, 'restaurants', rid);
  const existing = await getDoc(ref);

  const cleaned: Record<string, unknown> = {
    ownerId: rid,
    updatedAt: serverTimestamp(),
  };

  if (patch.name !== undefined) cleaned.name = String(patch.name).trim();
  if (patch.logo !== undefined) cleaned.logo = patch.logo;
  if (patch.location !== undefined) cleaned.location = String(patch.location).trim();
  if (patch.locationLat !== undefined) cleaned.locationLat = patch.locationLat;
  if (patch.locationLng !== undefined) cleaned.locationLng = patch.locationLng;
  if (patch.isOpen !== undefined) cleaned.isOpen = patch.isOpen;

  if (!existing.exists()) {
    cleaned.createdAt = Date.now();
  }

  await setDoc(ref, cleaned, { merge: true });

  try {
    await updateDoc(doc(db, 'users', rid), { restaurantId: rid });
  } catch {
    await setDoc(
      doc(db, 'users', rid),
      { restaurantId: rid },
      { merge: true },
    );
  }
}
