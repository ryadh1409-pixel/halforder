import {
  reverseGeocodeCoordinatesSafe,
  type SafeGeocodeResult,
} from '@/services/places/googlePlacesClient';

/** Display label when Google Geocoding is unavailable — never a cached city string. */
export const CURRENT_LOCATION_LABEL = 'Current Location';

export type ResolvedAddressFromGps = {
  address: string;
  /** True only when Google Geocoding API returned status OK. */
  geocoded: boolean;
  placeId?: string;
  geocodeStatus?: string;
  geocodeError?: string;
};

/**
 * Resolve a human-readable delivery label from GPS.
 * Always returns coordinates caller already has; never throws on geocode failure.
 */
export async function resolveAddressFromGps(
  latitude: number,
  longitude: number,
): Promise<ResolvedAddressFromGps> {
  const geocode: SafeGeocodeResult = await reverseGeocodeCoordinatesSafe(
    latitude,
    longitude,
  );

  if (geocode.ok) {
    return {
      address: geocode.address,
      geocoded: true,
      placeId: geocode.placeId || undefined,
    };
  }

  if (__DEV__) {
    console.warn('[location.geocode.fallback]', {
      status: geocode.status,
      message: geocode.message,
    });
  }

  return {
    address: CURRENT_LOCATION_LABEL,
    geocoded: false,
    geocodeStatus: geocode.status,
    geocodeError: geocode.message,
  };
}
