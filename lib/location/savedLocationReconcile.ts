import { haversineDistanceKm } from '@/lib/location/haversine';
import type { SavedLocation } from '@/types/savedLocation';

/** App launch + profile auto-update when device moved materially. */
export const SAVED_LOCATION_REPLACE_DISTANCE_KM = 1;

function normalizeCity(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * True when live GPS should replace a saved profile location.
 * City mismatch always wins; otherwise distance ≥ 1 km.
 */
export function savedLocationShouldBeReplacedByGps(
  saved: SavedLocation | null,
  gps: SavedLocation,
  minDistanceKm: number = SAVED_LOCATION_REPLACE_DISTANCE_KM,
): boolean {
  if (!saved) return false;

  const savedCity = normalizeCity(saved.city);
  const gpsCity = normalizeCity(gps.city);
  if (savedCity.length > 0 && gpsCity.length > 0 && savedCity !== gpsCity) {
    return true;
  }

  const km = haversineDistanceKm(
    { latitude: saved.latitude, longitude: saved.longitude },
    { latitude: gps.latitude, longitude: gps.longitude },
  );
  return km >= minDistanceKm;
}
