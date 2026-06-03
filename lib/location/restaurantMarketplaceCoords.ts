import { GeoPoint } from 'firebase/firestore';

import { logLocationDebug } from '@/lib/location/locationDebugLog';

export type RestaurantNormalizedCoords = {
  lat: number;
  lng: number;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pairFromRecord(
  record: Record<string, unknown> | null | undefined,
): RestaurantNormalizedCoords | null {
  if (!record) return null;

  const lat =
    finiteNumber(record.latitude) ??
    finiteNumber(record.lat) ??
    finiteNumber(record.locationLat);
  const lng =
    finiteNumber(record.longitude) ??
    finiteNumber(record.lng) ??
    finiteNumber(record.locationLng);

  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function pairFromGeoPoint(value: unknown): RestaurantNormalizedCoords | null {
  if (value instanceof GeoPoint) {
    return pairFromRecord({
      latitude: value.latitude,
      longitude: value.longitude,
    });
  }
  return null;
}

function deliveryLocationField(
  restaurant: Record<string, unknown>,
): unknown {
  if (restaurant.deliveryLocation != null) return restaurant.deliveryLocation;
  const alt = restaurant.DeliveryLocation;
  return alt ?? null;
}

/**
 * Canonical restaurant venue coordinates for marketplace distance / ETA.
 * Prefers `deliveryLocation`, then profile `location`, then root lat/lng / host fields.
 */
export function extractRestaurantCoords(
  restaurant: Record<string, unknown> | null | undefined,
): RestaurantNormalizedCoords | null {
  if (!restaurant) return null;

  const normalized = restaurant.normalizedCoords;
  if (normalized && typeof normalized === 'object') {
    const fromNormalized = pairFromRecord(normalized as Record<string, unknown>);
    if (fromNormalized) return fromNormalized;
  }

  const deliveryRaw = deliveryLocationField(restaurant);
  const deliveryGeo = pairFromGeoPoint(deliveryRaw);
  if (deliveryGeo) return deliveryGeo;

  if (deliveryRaw && typeof deliveryRaw === 'object' && !Array.isArray(deliveryRaw)) {
    const delivery = deliveryRaw as Record<string, unknown>;
    const fromDelivery = pairFromRecord(delivery);
    if (fromDelivery) return fromDelivery;

    const nestedGeo =
      pairFromGeoPoint(delivery.geoPoint) ??
      pairFromGeoPoint(delivery.geopoint) ??
      pairFromGeoPoint(delivery.geo);
    if (nestedGeo) return nestedGeo;
  }

  const locationRaw = restaurant.location;
  const locationGeo = pairFromGeoPoint(locationRaw);
  if (locationGeo) return locationGeo;

  if (locationRaw && typeof locationRaw === 'object' && !Array.isArray(locationRaw)) {
    const fromLocation = pairFromRecord(locationRaw as Record<string, unknown>);
    if (fromLocation) return fromLocation;
  }

  const fromRoot = pairFromRecord(restaurant);
  if (fromRoot) return fromRoot;

  return null;
}

/** Attach `normalizedCoords` for marketplace distance (single source for card math). */
export function attachNormalizedRestaurantCoords(
  id: string,
  data: Record<string, unknown>,
): Record<string, unknown> & { normalizedCoords: RestaurantNormalizedCoords | null } {
  const coords = extractRestaurantCoords(data);
  logLocationDebug('[NORMALIZED RESTAURANT COORDS]', { id, ...coords });

  if (!coords) {
    return { ...data, normalizedCoords: null };
  }

  const priorDelivery =
    typeof data.deliveryLocation === 'object' &&
    data.deliveryLocation != null &&
    !Array.isArray(data.deliveryLocation)
      ? (data.deliveryLocation as Record<string, unknown>)
      : {};

  const deliveryLocation: Record<string, unknown> = {
    ...priorDelivery,
    latitude: coords.lat,
    longitude: coords.lng,
    lat: coords.lat,
    lng: coords.lng,
  };

  return {
    ...data,
    normalizedCoords: coords,
    deliveryLocation,
    latitude: coords.lat,
    longitude: coords.lng,
    lat: coords.lat,
    lng: coords.lng,
  };
}

/** Entity passed into distance / eligibility (coords only). */
export function restaurantEntityForDistance(
  coords: RestaurantNormalizedCoords | null,
): { normalizedCoords: RestaurantNormalizedCoords } | null {
  if (!coords) return null;
  return { normalizedCoords: coords };
}
