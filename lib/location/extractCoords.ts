import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { extractRestaurantCoords } from '@/lib/location/restaurantMarketplaceCoords';

/** Canonical WGS84 pair for distance / ETA (always finite numbers). */
export type LatLngCoords = {
  lat: number;
  lng: number;
};

function finiteCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pairFromLatLng(lat: number | null, lng: number | null): LatLngCoords | null {
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Single coordinate extractor for users, restaurants, and session objects.
 *
 * Order:
 * 1. `deliveryLocation` map
 * 2. `location` map
 * 3. Root `latitude`/`longitude` or `lat`/`lng`
 */
export function extractCoords(entity: unknown): LatLngCoords | null {
  if (entity == null) return null;

  if (typeof entity === 'object') {
    const o = entity as Record<string, unknown>;

    if (o.normalizedCoords && typeof o.normalizedCoords === 'object') {
      const nc = o.normalizedCoords as Record<string, unknown>;
      const fromNormalized = pairFromLatLng(
        finiteCoord(nc.lat),
        finiteCoord(nc.lng),
      );
      if (fromNormalized) return fromNormalized;
    }

    if (o.deliveryLocation && typeof o.deliveryLocation === 'object') {
      const nested = extractCoords(o.deliveryLocation);
      if (nested) return nested;
    }

    if (o.location && typeof o.location === 'object') {
      const nested = extractCoords(o.location);
      if (nested) return nested;
    }

    const lat =
      finiteCoord(o.latitude) ??
      finiteCoord(o.lat) ??
      finiteCoord(o.locationLat);
    const lng =
      finiteCoord(o.longitude) ??
      finiteCoord(o.lng) ??
      finiteCoord(o.locationLng);
    const direct = pairFromLatLng(lat, lng);
    if (direct) return direct;
  }

  return null;
}

function extractRestaurantCoordsFromEntity(entity: unknown): LatLngCoords | null {
  if (entity == null) return null;
  if (typeof entity !== 'object') return null;

  const fromNormalized = extractCoords(entity);
  if (fromNormalized) return fromNormalized;

  return extractRestaurantCoords(entity as Record<string, unknown>);
}

export function logDistanceCoordInputs(
  userEntity: unknown,
  restaurantEntity: unknown,
): { userCoords: LatLngCoords | null; restaurantCoords: LatLngCoords | null } {
  const userCoords = extractCoords(userEntity);
  const restaurantCoords = extractRestaurantCoordsFromEntity(restaurantEntity);
  logLocationDebug('[DISTANCE INPUT USER]', userCoords as Record<string, unknown> | null);
  logLocationDebug('[DISTANCE INPUT RESTAURANT]', restaurantCoords as Record<string, unknown> | null);
  return { userCoords, restaurantCoords };
}
