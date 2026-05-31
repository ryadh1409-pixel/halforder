import type { DriverLiveCoordinate, GeoCoordinate } from '@/types/location';

/** Default map zoom delta when only one point is known (no city hardcoding). */
export const DEFAULT_MAP_DELTA = {
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
} as const;

export type LegacyLatLng = { lat: number; lng: number; heading?: number | null; speed?: number | null };

/**
 * Parse any Firestore / client location shape into `{ lat, lng }`.
 * Supports: lat/lng, latitude/longitude, nested location objects.
 */
export function parseLegacyLatLng(value: unknown): LegacyLatLng | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;

  const latRaw =
    typeof o.lat === 'number'
      ? o.lat
      : typeof o.latitude === 'number'
        ? o.latitude
        : Number(o.lat ?? o.latitude);
  const lngRaw =
    typeof o.lng === 'number'
      ? o.lng
      : typeof o.longitude === 'number'
        ? o.longitude
        : Number(o.lng ?? o.longitude);

  if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) return null;
  if (Math.abs(latRaw) > 90 || Math.abs(lngRaw) > 180) return null;

  const headingRaw = o.heading;
  const speedRaw = o.speed;
  const heading =
    typeof headingRaw === 'number' && Number.isFinite(headingRaw) ? headingRaw : null;
  const speed = typeof speedRaw === 'number' && Number.isFinite(speedRaw) ? speedRaw : null;

  const base: LegacyLatLng = { lat: latRaw, lng: lngRaw };
  if (heading != null) base.heading = heading;
  if (speed != null) base.speed = speed;
  return base;
}

export function toGeoCoordinate(value: unknown): GeoCoordinate | null {
  const parsed = parseLegacyLatLng(value);
  if (!parsed) return null;
  return { latitude: parsed.lat, longitude: parsed.lng };
}

export function toMapCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  return toGeoCoordinate(value);
}

export function legacyToGeo(coord: LegacyLatLng): GeoCoordinate {
  return { latitude: coord.lat, longitude: coord.lng };
}

export function geoToLegacy(coord: GeoCoordinate): LegacyLatLng {
  return { lat: coord.latitude, lng: coord.longitude };
}

/** Collect valid map coordinates from nullable inputs. */
export function collectMapCoordinates(
  ...points: (unknown | null | undefined)[]
): GeoCoordinate[] {
  const out: GeoCoordinate[] = [];
  for (const p of points) {
    const c = toGeoCoordinate(p);
    if (c) out.push(c);
  }
  return out;
}

/** Initial map region centered on first known point — never uses a fake city. */
export function regionFromCoordinates(
  points: GeoCoordinate[],
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} | null {
  if (points.length === 0) return null;
  const first = points[0];
  return {
    latitude: first.latitude,
    longitude: first.longitude,
    ...DEFAULT_MAP_DELTA,
  };
}

export function driverCoordFromGps(coords: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
}): DriverLiveCoordinate {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    heading:
      typeof coords.heading === 'number' && Number.isFinite(coords.heading)
        ? coords.heading
        : null,
    speed:
      typeof coords.speed === 'number' && Number.isFinite(coords.speed) ? coords.speed : null,
  };
}
