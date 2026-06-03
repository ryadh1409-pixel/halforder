import { logLocationDebug } from '@/lib/location/locationDebugLog';
import {
  reverseGeocodeCoordinatesSafe,
  type SafeGeocodeResult,
} from '@/services/places/googlePlacesClient';
import type { SavedLocation } from '@/types/savedLocation';

export type ResolvedAddressFromGps = {
  address: string;
  /** True only when Google Geocoding API returned status OK. */
  geocoded: boolean;
  placeId?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  geocodeStatus?: string;
  geocodeError?: string;
};

function fromSafeGeocode(geocode: SafeGeocodeResult): ResolvedAddressFromGps {
  if (!geocode.ok) {
    return {
      address: '',
      geocoded: false,
      geocodeStatus: geocode.status,
      geocodeError: geocode.message,
    };
  }

  return {
    address: geocode.address,
    geocoded: true,
    placeId: geocode.placeId || undefined,
    city: geocode.city,
    province: geocode.province,
    country: geocode.country,
    postalCode: geocode.postalCode,
  };
}

/**
 * Resolve a human-readable delivery address from GPS via Google Geocoding.
 * Never returns placeholder city strings or hardcoded coordinates.
 */
export async function resolveAddressFromGps(
  latitude: number,
  longitude: number,
): Promise<ResolvedAddressFromGps> {
  logLocationDebug('[REVERSE GEOCODE]', { latitude, longitude });
  const geocode = await reverseGeocodeCoordinatesSafe(latitude, longitude);
  const resolved = fromSafeGeocode(geocode);
  logLocationDebug('[REVERSE GEOCODE]', {
    geocoded: resolved.geocoded,
    address: resolved.address?.slice(0, 80),
    city: resolved.city,
    status: resolved.geocodeStatus,
  });
  return resolved;
}

/** Build a {@link SavedLocation} from GPS + reverse geocode (requires successful geocode). */
export function savedLocationFromGpsResolve(
  latitude: number,
  longitude: number,
  resolved: ResolvedAddressFromGps,
): SavedLocation | null {
  if (!resolved.geocoded || !resolved.address.trim()) return null;
  return {
    address: resolved.address.trim(),
    latitude,
    longitude,
    ...(resolved.placeId ? { placeId: resolved.placeId } : {}),
    ...(resolved.city ? { city: resolved.city } : {}),
    ...(resolved.province ? { province: resolved.province } : {}),
    ...(resolved.country ? { country: resolved.country } : {}),
    ...(resolved.postalCode ? { postalCode: resolved.postalCode } : {}),
  };
}
