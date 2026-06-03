import { Timestamp } from 'firebase/firestore';

import { parseLegacyLatLng } from '@/lib/location/coordinates';
import type { SavedLocation } from '@/types/savedLocation';

/** Canonical restaurant venue coordinates for marketplace + delivery. */
export type RestaurantDeliveryLocation = {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  updatedAt?: number;
};

function parseUpdatedAtMs(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function coordsFromMap(o: Record<string, unknown>): { lat: number; lng: number } | null {
  const parsed = parseLegacyLatLng(o);
  if (!parsed) return null;
  return { lat: parsed.lat, lng: parsed.lng };
}

function addressFromMap(o: Record<string, unknown>, coords: { lat: number; lng: number }): string {
  const address =
    (typeof o.address === 'string' && o.address.trim()) ||
    (typeof o.formattedAddress === 'string' && o.formattedAddress.trim()) ||
    '';
  if (address) return address;
  const city = typeof o.city === 'string' ? o.city.trim() : '';
  if (city) return city;
  return `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
}

function fromLocationMap(
  o: Record<string, unknown> | null | undefined,
): RestaurantDeliveryLocation | null {
  if (!o || typeof o !== 'object') return null;
  const coords = coordsFromMap(o);
  if (!coords) return null;
  const city =
    typeof o.city === 'string' && o.city.trim() ? o.city.trim() : undefined;
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    address: addressFromMap(o, coords),
    ...(city ? { city } : {}),
    updatedAt: parseUpdatedAtMs(o.updatedAt),
  };
}

/**
 * Single source of truth for restaurant venue GPS on Firestore `restaurants/{id}`.
 * Prefers `deliveryLocation`, then profile `location`, then legacy root fields.
 */
export function parseRestaurantDeliveryLocation(
  data: Record<string, unknown> | undefined,
): RestaurantDeliveryLocation | null {
  if (!data) return null;

  const delivery =
    data.deliveryLocation && typeof data.deliveryLocation === 'object'
      ? fromLocationMap(data.deliveryLocation as Record<string, unknown>)
      : null;
  if (delivery) return delivery;

  const profileLocation =
    data.location && typeof data.location === 'object'
      ? fromLocationMap(data.location as Record<string, unknown>)
      : null;
  if (profileLocation) return profileLocation;

  const rootCoords = coordsFromMap(data);
  if (!rootCoords) return null;

  const city =
    typeof data.city === 'string' && data.city.trim() ? data.city.trim() : undefined;

  return {
    latitude: rootCoords.lat,
    longitude: rootCoords.lng,
    address: addressFromMap(data, rootCoords),
    ...(city ? { city } : {}),
    updatedAt: parseUpdatedAtMs(data.lastLocationUpdatedAt),
  };
}

export { extractRestaurantCoords } from '@/lib/location/restaurantMarketplaceCoords';

export function restaurantDeliveryLocationFromSaved(
  location: SavedLocation,
): RestaurantDeliveryLocation {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.formattedAddress?.trim() || location.address.trim(),
    ...(location.city?.trim() ? { city: location.city.trim() } : {}),
    updatedAt: location.updatedAt ?? Date.now(),
  };
}

/** Firestore payload for `restaurants/{id}.deliveryLocation`. */
export function restaurantDeliveryLocationToFirestore(
  location: SavedLocation,
): Record<string, unknown> {
  const venue = restaurantDeliveryLocationFromSaved(location);
  return {
    latitude: venue.latitude,
    longitude: venue.longitude,
    address: venue.address,
    formattedAddress: location.formattedAddress?.trim() || venue.address,
    ...(venue.city ? { city: venue.city } : {}),
    ...(location.gpsAccuracy != null && Number.isFinite(location.gpsAccuracy)
      ? { gpsAccuracy: location.gpsAccuracy }
      : {}),
    ...(location.placeId ? { placeId: location.placeId } : {}),
    ...(location.province ? { province: location.province } : {}),
    ...(location.country ? { country: location.country } : {}),
    ...(location.postalCode ? { postalCode: location.postalCode } : {}),
  };
}

export function savedLocationFromRestaurantDelivery(
  venue: RestaurantDeliveryLocation,
): SavedLocation {
  return {
    address: venue.address,
    formattedAddress: venue.address,
    latitude: venue.latitude,
    longitude: venue.longitude,
    ...(venue.city ? { city: venue.city } : {}),
    ...(venue.updatedAt != null ? { updatedAt: venue.updatedAt } : {}),
  };
}
