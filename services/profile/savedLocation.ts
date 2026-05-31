import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import {
  parseUserSavedLocation,
  userSavedLocationToFirestore,
} from '@/lib/location/parseUserLocation';
import type { SavedAddressLabel, UserSavedLocation } from '@/types/userLocation';
import { db } from '@/services/firebase';

export { parseUserSavedLocation };

/** Persist canonical delivery location on `users/{uid}`. */
export async function saveUserSavedLocation(
  userId: string,
  location: UserSavedLocation,
  options?: { label?: SavedAddressLabel },
): Promise<UserSavedLocation> {
  const uid = userId.trim();
  if (!uid) throw new Error('User id is required.');

  const payload = userSavedLocationToFirestore(location);
  await setDoc(
    doc(db, 'users', uid),
    {
      location: payload,
      ...(options?.label ? { locationLabel: options.label } : {}),
      latitude: payload.latitude,
      longitude: payload.longitude,
      lastLocationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return payload;
}

/** Read saved location from a Firestore user document snapshot. */
export function readSavedLocationFromUserDoc(
  data: Record<string, unknown> | undefined,
): UserSavedLocation | null {
  if (!data) return null;
  return parseUserSavedLocation(data.location);
}

export function readSavedLocationLabelFromUserDoc(
  data: Record<string, unknown> | undefined,
): SavedAddressLabel | null {
  const raw = data?.locationLabel;
  if (raw === 'home' || raw === 'apartment' || raw === 'building' || raw === 'custom') {
    return raw;
  }
  return null;
}
