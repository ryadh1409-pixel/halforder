import type { SavedLocation } from '@/types/savedLocation';

/** Avoid redundant React state updates from Firestore snapshots. */
export function savedLocationsEqual(
  a: SavedLocation | null | undefined,
  b: SavedLocation | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.address === b.address &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    (a.city ?? '') === (b.city ?? '') &&
    (a.postalCode ?? '') === (b.postalCode ?? '') &&
    (a.placeId ?? '') === (b.placeId ?? '') &&
    (a.gpsAccuracy ?? null) === (b.gpsAccuracy ?? null)
  );
}
