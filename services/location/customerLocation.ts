import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import type { CustomerLocationRecord, DeliveryAddressBundle } from '@/types/location';
import { auth, db } from '@/services/firebase';

import {
  getCurrentGpsReading,
  LocationPermissionError,
  LocationUnavailableError,
} from './gps';
import {
  CURRENT_LOCATION_LABEL,
  resolveAddressFromGps,
} from './resolveAddressFromGps';

export function buildCustomerLocationRecord(
  latitude: number,
  longitude: number,
): CustomerLocationRecord {
  return {
    latitude,
    longitude,
    timestamp: serverTimestamp(),
  };
}

/** Persist latest customer GPS on `users/{uid}`. */
export async function persistCustomerLocation(
  userId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      customerLocation: buildCustomerLocationRecord(latitude, longitude),
      location: { lat: latitude, lng: longitude },
      latitude,
      longitude,
      lastLocationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type ResolveDeliveryLocationOptions = {
  /** When false, throws if GPS unavailable (required for delivery checkout). */
  required?: boolean;
  persistToProfile?: boolean;
};

/**
 * Resolve real delivery coordinates + address for marketplace checkout.
 * Never returns hardcoded fallback coordinates.
 */
export async function resolveDeliveryLocationForCheckout(
  options: ResolveDeliveryLocationOptions = {},
): Promise<DeliveryAddressBundle> {
  const { required = true, persistToProfile = true } = options;
  const uid = auth.currentUser?.uid?.trim() ?? '';

  let reading;
  try {
    reading = await getCurrentGpsReading({ fresh: true });
  } catch (error) {
    if (required) {
      if (error instanceof LocationPermissionError) {
        throw new Error('Enable location access to place a delivery order.');
      }
      throw new LocationUnavailableError();
    }
    throw error;
  }

  const resolved = await resolveAddressFromGps(reading.latitude, reading.longitude);
  const address = resolved.address || CURRENT_LOCATION_LABEL;
  const customerLocation = buildCustomerLocationRecord(reading.latitude, reading.longitude);

  if (persistToProfile && uid) {
    try {
      await persistCustomerLocation(uid, reading.latitude, reading.longitude);
      if (resolved.geocoded) {
        const { saveUserSavedLocation } = await import('@/services/profile/savedLocation');
        await saveUserSavedLocation(uid, {
          address: resolved.address,
          latitude: reading.latitude,
          longitude: reading.longitude,
          ...(resolved.placeId ? { placeId: resolved.placeId } : {}),
        });
      } else {
        const { persistGpsCoordinatesOnly } = await import('@/services/profile/savedLocation');
        await persistGpsCoordinatesOnly(uid, reading.latitude, reading.longitude);
      }
    } catch {
      /* non-fatal — order still carries coords */
    }
  }

  return {
    lat: reading.latitude,
    lng: reading.longitude,
    address,
    customerLocation,
  };
}
