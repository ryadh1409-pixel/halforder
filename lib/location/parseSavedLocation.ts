import { Timestamp } from 'firebase/firestore';

import { parseLegacyLatLng } from '@/lib/location/coordinates';
import type { SavedLocation } from '@/types/savedLocation';

function parseUpdatedAtMs(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/** Parse `location` map from Firestore (canonical schema + legacy lat/lng). */
export function parseSavedLocation(value: unknown): SavedLocation | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;

  const coords = parseLegacyLatLng(o);
  if (!coords) return null;

  const address =
    typeof o.address === 'string' && o.address.trim().length > 0
      ? o.address.trim()
      : null;
  if (!address) return null;

  const optionalString = (key: string): string | undefined => {
    const raw = o[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
  };

  const placeId = optionalString('placeId');
  const updatedAt = parseUpdatedAtMs(o.updatedAt);
  const formatted =
    optionalString('formattedAddress') ?? address;
  const gpsRaw = o.gpsAccuracy;
  const gpsAccuracy =
    typeof gpsRaw === 'number' && Number.isFinite(gpsRaw) ? gpsRaw : undefined;

  return {
    address,
    formattedAddress: formatted,
    latitude: coords.lat,
    longitude: coords.lng,
    ...(placeId ? { placeId } : {}),
    ...(optionalString('city') ? { city: optionalString('city') } : {}),
    ...(optionalString('province') ? { province: optionalString('province') } : {}),
    ...(optionalString('country') ? { country: optionalString('country') } : {}),
    ...(optionalString('postalCode') ? { postalCode: optionalString('postalCode') } : {}),
    ...(gpsAccuracy != null ? { gpsAccuracy } : {}),
    ...(updatedAt != null ? { updatedAt } : {}),
  };
}

export function savedLocationToFirestore(location: SavedLocation): Omit<SavedLocation, 'updatedAt'> {
  const address = location.address.trim();
  if (!address) {
    throw new Error('Address is required.');
  }
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error('Valid coordinates are required.');
  }

  const out: Omit<SavedLocation, 'updatedAt'> = {
    address,
    formattedAddress: location.formattedAddress?.trim() || address,
    latitude: location.latitude,
    longitude: location.longitude,
  };

  if (location.gpsAccuracy != null && Number.isFinite(location.gpsAccuracy)) {
    out.gpsAccuracy = location.gpsAccuracy;
  }

  const copyOptional = (key: keyof Omit<SavedLocation, 'updatedAt' | 'address' | 'latitude' | 'longitude' | 'formattedAddress' | 'gpsAccuracy'>) => {
    const raw = location[key];
    if (typeof raw === 'string' && raw.trim()) {
      (out as Record<string, unknown>)[key] = raw.trim();
    }
  };

  copyOptional('placeId');
  copyOptional('city');
  copyOptional('province');
  copyOptional('country');
  copyOptional('postalCode');

  return out;
}

/** @deprecated Use {@link parseSavedLocation} */
export const parseUserSavedLocation = parseSavedLocation;

/** @deprecated Use {@link savedLocationToFirestore} */
export const userSavedLocationToFirestore = savedLocationToFirestore;
