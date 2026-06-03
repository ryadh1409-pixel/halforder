import { parseSavedLocation } from '@/lib/location/parseSavedLocation';
import { readSavedLocationLabelFromUserDoc } from '@/lib/location/userLocationLabel';
import { saveAccountSavedLocation } from '@/services/location/savedLocationFirestore';
import type { SavedAddressLabel, UserSavedLocation } from '@/types/userLocation';

export { parseSavedLocation as parseUserSavedLocation };
export { readSavedLocationLabelFromUserDoc };

/** Persist canonical delivery location on `users/{uid}`. */
export async function saveUserSavedLocation(
  userId: string,
  location: UserSavedLocation,
  options?: { label?: SavedAddressLabel },
): Promise<UserSavedLocation> {
  return saveAccountSavedLocation('users', userId, location, options);
}

/** Read saved location from a Firestore user document snapshot. */
export function readSavedLocationFromUserDoc(
  data: Record<string, unknown> | undefined,
): UserSavedLocation | null {
  if (!data) return null;
  return parseSavedLocation(data.location);
}

