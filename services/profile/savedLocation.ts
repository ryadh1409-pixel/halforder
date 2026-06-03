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
  const firestorePayload = {
    location: payload,
    ...(options?.label ? { locationLabel: options.label } : {}),
    latitude: payload.latitude,
    longitude: payload.longitude,
    lastLocationUpdatedAt: serverTimestamp(),
  };

  console.log('[PROFILE LOCATION SAVE]', {
    uid,
    label: options?.label ?? null,
    location: payload,
  });

  await setDoc(doc(db, 'users', uid), firestorePayload, { merge: true });
  return payload;
}

/** Read saved location from a Firestore user document snapshot. */
export function readSavedLocationFromUserDoc(
  data: Record<string, unknown> | undefined,
): UserSavedLocation | null {
  if (!data) return null;
  return parseUserSavedLocation(data.location);
}

/** Persist GPS only — clears stale formatted address from Firestore. */
export async function persistGpsCoordinatesOnly(
  userId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  await setDoc(
    doc(db, 'users', uid),
    {
      latitude,
      longitude,
      location: { latitude, longitude },
      lastLocationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (__DEV__) {
    console.log('[PROFILE LOCATION GPS ONLY]', { uid, latitude, longitude });
  }
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
