import {
  doc,
  getDoc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { savedAddressLabelToDeliveryType } from '@/lib/location/deliveryAddressType';
import { logLocationDebug } from '@/lib/location/locationDebugLog';
import {
  restaurantDeliveryLocationToFirestore,
  parseRestaurantDeliveryLocation,
  savedLocationFromRestaurantDelivery,
} from '@/lib/location/restaurantDeliveryLocation';
import {
  parseSavedLocation,
  savedLocationToFirestore,
} from '@/lib/location/parseSavedLocation';
import type { AccountLocationRole } from '@/services/location/accountLocationRole';
import { logRoleGps } from '@/services/location/accountLocationRole';
import { syncDriverProfileBaseLocation } from '@/services/location/driverTracking';
import { refreshLiveGpsBiasCache } from '@/services/location/locationLocalCache';
import { readSavedLocationLabelFromUserDoc } from '@/lib/location/userLocationLabel';
import { db } from '@/services/firebase';
import type { AccountLocationCollection, SavedLocation } from '@/types/savedLocation';
import type { SavedAddressLabel } from '@/types/userLocation';

export { parseSavedLocation };

export type SaveAccountLocationOptions = {
  label?: SavedAddressLabel;
  gpsAccuracy?: number | null;
  role?: AccountLocationRole;
};

function collectionToRole(collection: AccountLocationCollection): AccountLocationRole {
  if (collection === 'drivers') return 'driver';
  if (collection === 'restaurants') return 'restaurant';
  return 'user';
}

/** Read saved location from user/driver/restaurant document. */
export function readSavedLocationFromDoc(
  data: Record<string, unknown> | undefined,
): SavedLocation | null {
  if (!data) return null;

  const deliveryVenue = parseRestaurantDeliveryLocation(data);
  if (deliveryVenue) {
    return savedLocationFromRestaurantDelivery(deliveryVenue);
  }

  const fromMap = parseSavedLocation(data.location);
  if (fromMap) return fromMap;

  const address = typeof data.address === 'string' ? data.address.trim() : '';
  const lat =
    typeof data.lat === 'number'
      ? data.lat
      : typeof data.latitude === 'number'
        ? data.latitude
        : typeof data.locationLat === 'number'
          ? data.locationLat
          : null;
  const lng =
    typeof data.lng === 'number'
      ? data.lng
      : typeof data.longitude === 'number'
        ? data.longitude
        : typeof data.locationLng === 'number'
          ? data.locationLng
          : null;

  if (!address || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const city = typeof data.city === 'string' ? data.city.trim() : undefined;

  return {
    address,
    formattedAddress: address,
    latitude: lat,
    longitude: lng,
    ...(city ? { city } : {}),
  };
}

export type ServerSavedLocationResult = {
  location: SavedLocation | null;
  label: SavedAddressLabel | null;
};

/** Load location from Firestore server — never from local persistence cache. */
export async function fetchSavedLocationFromServer(
  collection: AccountLocationCollection,
  accountId: string,
): Promise<ServerSavedLocationResult> {
  const id = accountId.trim();
  if (!id) return { location: null, label: null };

  const snap = await getDocFromServer(doc(db, collection, id));
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;

  return {
    location: readSavedLocationFromDoc(data),
    label: collection === 'users' ? readSavedLocationLabelFromUserDoc(data) : null,
  };
}

/** Persist canonical location on `users|drivers|restaurants/{accountId}`. */
export async function saveAccountSavedLocation(
  collection: AccountLocationCollection,
  accountId: string,
  location: SavedLocation,
  options?: SaveAccountLocationOptions,
): Promise<SavedLocation> {
  const id = accountId.trim();
  if (!id) throw new Error('Account id is required.');

  const role = options?.role ?? collectionToRole(collection);
  const enriched: SavedLocation = {
    ...location,
    formattedAddress: location.formattedAddress?.trim() || location.address.trim(),
    ...(options?.gpsAccuracy != null && Number.isFinite(options.gpsAccuracy)
      ? { gpsAccuracy: options.gpsAccuracy }
      : location.gpsAccuracy != null
        ? { gpsAccuracy: location.gpsAccuracy }
        : {}),
  };

  const base = savedLocationToFirestore(enriched);
  const deliveryType =
    collection === 'users' && options?.label
      ? savedAddressLabelToDeliveryType(options.label)
      : undefined;

  const locationWithTimestamp: Record<string, unknown> = {
    address: base.address,
    formattedAddress: base.formattedAddress ?? base.address,
    latitude: base.latitude,
    longitude: base.longitude,
    lat: base.latitude,
    lng: base.longitude,
    ...(base.placeId ? { placeId: base.placeId } : {}),
    ...(base.city ? { city: base.city } : {}),
    ...(base.province ? { province: base.province } : {}),
    ...(base.country ? { country: base.country } : {}),
    ...(base.postalCode ? { postalCode: base.postalCode } : {}),
    ...(base.gpsAccuracy != null && Number.isFinite(base.gpsAccuracy)
      ? { gpsAccuracy: base.gpsAccuracy }
      : {}),
    updatedAt: serverTimestamp(),
    ...(deliveryType ? { type: deliveryType } : {}),
  };

  let firestorePayload: Record<string, unknown>;

  if (collection === 'restaurants') {
    firestorePayload = {
      deliveryLocation: {
        ...restaurantDeliveryLocationToFirestore(enriched),
        updatedAt: serverTimestamp(),
      },
      normalizedCoords: {
        lat: base.latitude,
        lng: base.longitude,
      },
      latitude: base.latitude,
      longitude: base.longitude,
      lat: base.latitude,
      lng: base.longitude,
      address: base.address,
      formattedAddress: base.formattedAddress ?? base.address,
      lastLocationUpdatedAt: serverTimestamp(),
      ...(base.city ? { city: base.city } : {}),
    };
    if (base.gpsAccuracy != null && Number.isFinite(base.gpsAccuracy)) {
      firestorePayload.gpsAccuracy = base.gpsAccuracy;
    }
  } else {
    firestorePayload = {
      location: locationWithTimestamp,
      latitude: base.latitude,
      longitude: base.longitude,
      lat: base.latitude,
      lng: base.longitude,
      formattedAddress: base.formattedAddress ?? base.address,
      lastLocationUpdatedAt: serverTimestamp(),
    };

    if (base.gpsAccuracy != null && Number.isFinite(base.gpsAccuracy)) {
      firestorePayload.gpsAccuracy = base.gpsAccuracy;
    }

    if (collection === 'users') {
      firestorePayload.address = base.address;
      firestorePayload.city = base.city ?? '';
      if (options?.label) {
        firestorePayload.locationLabel = options.label;
        firestorePayload.type = deliveryType;
      }
    }

    if (collection === 'drivers') {
      firestorePayload.address = base.address;
      if (base.city) firestorePayload.city = base.city;
    }
  }

  const ref = doc(db, collection, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, firestorePayload);
  } else {
    await setDoc(ref, firestorePayload);
  }

  if (collection === 'drivers') {
    try {
      await syncDriverProfileBaseLocation(id, {
        latitude: base.latitude,
        longitude: base.longitude,
        heading: null,
        speed: null,
      });
      logRoleGps('driver', 'live_coordinates_updated', {
        driverId: id,
        latitude: base.latitude,
        longitude: base.longitude,
      });
    } catch {
      /* profile save still succeeded */
    }
  }

  await refreshLiveGpsBiasCache({
    latitude: base.latitude,
    longitude: base.longitude,
    accuracy: base.gpsAccuracy ?? null,
    capturedAt: Date.now(),
  });

  logRoleGps(role, 'saved', {
    accountId: id,
    city: base.city,
    gpsAccuracy: base.gpsAccuracy,
  });
  logLocationDebug('[PROFILE LOCATION UPDATED]', {
    role,
    accountId: id,
    address: base.address,
    city: base.city,
  });

  return {
    ...base,
    updatedAt: Date.now(),
  };
}
