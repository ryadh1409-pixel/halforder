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
  phoneNumber: string | null;
  location: string;
  logoUrl: string | null;
}): Promise<void> {
  const uid = input.uid.trim();
  if (!uid) throw new Error('Invalid owner id');
  const ref = doc(db, 'restaurants', uid);
  const firestorePath = `restaurants/${uid}`;
  const snap = await getDoc(ref);
  const phone =
    typeof input.phoneNumber === 'string' && input.phoneNumber.trim()
      ? input.phoneNumber.trim()
      : null;
  const logoUrl =
    typeof input.logoUrl === 'string' && input.logoUrl.trim()
      ? input.logoUrl.trim()
      : null;
  const payload = {
    id: uid,
    name: input.name.trim(),
    phoneNumber: phone,
    phone,
    location: input.location.trim(),
    logo: logoUrl,
    logoUrl,
    ownerId: uid,
    stripeAccountId:
      typeof snap.data()?.stripeAccountId === 'string'
        ? snap.data()?.stripeAccountId
        : null,
    updatedAt: serverTimestamp(),
    ...(snap.exists() ? {} : { createdAt: Date.now() }),
  };
  console.log('[venue.save] auth uid:', uid);
  console.log('[venue.save] document id:', uid);
  console.log('[venue.save] firestore path:', firestorePath);
  console.log('[venue.save] payload:', JSON.stringify(payload));
  await setDoc(
    ref,
    payload,
    { merge: true },
  );
  const verifySnap = await getDoc(ref);
  console.log('[venue.save] exists after write:', verifySnap.exists());
  try {
    await updateDoc(doc(db, 'users', uid), { restaurantId: uid });
  } catch {
    await setDoc(doc(db, 'users', uid), { restaurantId: uid }, { merge: true });
  }
}

export type HostRestaurantPatch = {
  name?: string;
  logo?: string | null;
  logoUrl?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
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
  if (patch.logoUrl !== undefined) cleaned.logoUrl = patch.logoUrl;
  if (patch.phoneNumber !== undefined) cleaned.phoneNumber = patch.phoneNumber;
  if (patch.phone !== undefined) cleaned.phone = patch.phone;
  if (patch.location !== undefined) cleaned.location = String(patch.location).trim();
  if (patch.locationLat !== undefined) cleaned.locationLat = patch.locationLat;
  if (patch.locationLng !== undefined) cleaned.locationLng = patch.locationLng;

  const lat =
    typeof patch.locationLat === 'number' && Number.isFinite(patch.locationLat)
      ? patch.locationLat
      : null;
  const lng =
    typeof patch.locationLng === 'number' && Number.isFinite(patch.locationLng)
      ? patch.locationLng
      : null;
  if (lat != null && lng != null) {
    const addressLine =
      patch.location !== undefined
        ? String(patch.location).trim()
        : typeof existing.data()?.location === 'string'
          ? String(existing.data()?.location).trim()
          : typeof existing.data()?.address === 'string'
            ? String(existing.data()?.address).trim()
            : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    cleaned.deliveryLocation = {
      latitude: lat,
      longitude: lng,
      address: addressLine || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      updatedAt: serverTimestamp(),
    };
    cleaned.latitude = lat;
    cleaned.longitude = lng;
    cleaned.lat = lat;
    cleaned.lng = lng;
    if (addressLine) cleaned.address = addressLine;
  }
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
