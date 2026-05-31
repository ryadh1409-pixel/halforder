import { parseLegacyLatLng } from '@/lib/location/coordinates';
import type { UserSavedLocation } from '@/types/userLocation';

/** Parse `users/{uid}.location` from Firestore (canonical schema + legacy lat/lng). */
export function parseUserSavedLocation(value: unknown): UserSavedLocation | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;

  const coords = parseLegacyLatLng(o);
  if (!coords) return null;

  const address =
    typeof o.address === 'string' && o.address.trim().length > 0
      ? o.address.trim()
      : null;
  if (!address) return null;

  const placeId =
    typeof o.placeId === 'string' && o.placeId.trim().length > 0
      ? o.placeId.trim()
      : undefined;

  return {
    address,
    latitude: coords.lat,
    longitude: coords.lng,
    ...(placeId ? { placeId } : {}),
  };
}

export function userSavedLocationToFirestore(
  location: UserSavedLocation,
): UserSavedLocation {
  const address = location.address.trim();
  if (!address) {
    throw new Error('Address is required.');
  }
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error('Valid coordinates are required.');
  }
  const out: UserSavedLocation = {
    address,
    latitude: location.latitude,
    longitude: location.longitude,
  };
  if (location.placeId?.trim()) {
    out.placeId = location.placeId.trim();
  }
  return out;
}
