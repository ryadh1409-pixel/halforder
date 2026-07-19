import { auth, db } from '@/services/firebase';
import {
  getCurrentGpsReading,
  requestForegroundLocationPermission,
} from '@/services/location/gps';
import { resolveAddressFromGps } from '@/services/location/resolveAddressFromGps';
import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';

export type ProfileLocationFields = {
  latitude: number;
  longitude: number;
  city: string;
  province: string;
  country: string;
};

/**
 * Persist profile location for nearby matching (nested + top-level fields).
 * Does not replace delivery `location.address` helpers used elsewhere —
 * merges the matching fields the sign-up flow requires.
 */
export async function saveUserProfileLocation(
  uid: string,
  fields: ProfileLocationFields,
): Promise<void> {
  const id = uid.trim();
  if (!id) throw new Error('Missing user id.');

  const city = fields.city.trim();
  const province = fields.province.trim();
  const country = fields.country.trim();
  if (!city || !province || !country) {
    throw new Error(
      'Could not resolve city, province, and country from your location. Try again.',
    );
  }
  if (!Number.isFinite(fields.latitude) || !Number.isFinite(fields.longitude)) {
    throw new Error('Invalid location coordinates.');
  }

  const location = {
    latitude: fields.latitude,
    longitude: fields.longitude,
    city,
    province,
    country,
  };

  await setDoc(
    doc(db, 'users', id),
    {
      location,
      latitude: fields.latitude,
      longitude: fields.longitude,
      city,
      province,
      country,
      lastLocationUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Request permission → GPS → reverse geocode → Firestore. */
export async function captureAndSaveCurrentProfileLocation(
  uid?: string | null,
): Promise<ProfileLocationFields> {
  const id = (uid ?? auth.currentUser?.uid ?? '').trim();
  if (!id) throw new Error('Sign in to save your location.');

  const permission = await requestForegroundLocationPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Location permission was not granted. You can enable it later in Profile.',
    );
  }

  const reading = await getCurrentGpsReading({ highAccuracy: true });
  const resolved = await resolveAddressFromGps(
    reading.latitude,
    reading.longitude,
  );

  const fields: ProfileLocationFields = {
    latitude: reading.latitude,
    longitude: reading.longitude,
    city: (resolved.city ?? '').trim(),
    province: (resolved.province ?? '').trim(),
    country: (resolved.country ?? '').trim(),
  };

  await saveUserProfileLocation(id, fields);
  return fields;
}

export function subscribeUserProfileLocation(
  uid: string,
  onData: (loc: ProfileLocationFields | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const nested =
        data.location && typeof data.location === 'object'
          ? (data.location as Record<string, unknown>)
          : null;

      const latitude =
        typeof nested?.latitude === 'number'
          ? nested.latitude
          : typeof data.latitude === 'number'
            ? data.latitude
            : null;
      const longitude =
        typeof nested?.longitude === 'number'
          ? nested.longitude
          : typeof data.longitude === 'number'
            ? data.longitude
            : null;
      const city =
        (typeof nested?.city === 'string' && nested.city.trim()) ||
        (typeof data.city === 'string' && data.city.trim()) ||
        '';
      const province =
        (typeof nested?.province === 'string' && nested.province.trim()) ||
        (typeof data.province === 'string' && data.province.trim()) ||
        '';
      const country =
        (typeof nested?.country === 'string' && nested.country.trim()) ||
        (typeof data.country === 'string' && data.country.trim()) ||
        '';

      if (
        latitude == null ||
        longitude == null ||
        !city ||
        !province ||
        !country
      ) {
        onData(null);
        return;
      }

      onData({ latitude, longitude, city, province, country });
    },
    () => onData(null),
  );
}

export function formatProfileLocationLabel(
  loc: ProfileLocationFields | null,
): string {
  if (!loc) return 'Location not set';
  return `${loc.city}, ${loc.province}`;
}
