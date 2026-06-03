import * as Location from 'expo-location';

import type { AccountLocationRole } from '@/services/location/accountLocationRole';
import { logRoleGps } from '@/services/location/accountLocationRole';
import type { SavedLocation } from '@/types/savedLocation';
import type { DeliveryAddressBundle } from '@/types/location';

import {
  getFreshHighAccuracyGpsReading,
  getForegroundPermissionStatus,
  isGpsPositionStale,
  LIVE_GPS_PRECISE_ERROR,
  LocationPermissionError,
  LocationUnavailableError,
  MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
  requestForegroundLocationPermission,
  type GpsPermissionStatus,
  type GpsReading,
} from './gps';
import {
  claimGpsRefreshSession,
  getSessionGpsReading,
  setSessionGpsReading,
} from './gpsSession';
import { savedLocationShouldBeReplacedByGps } from '@/lib/location/savedLocationReconcile';

import { buildCustomerLocationRecord } from './customerLocationRecord';
import {
  resolveAddressFromGps,
  savedLocationFromGpsResolve,
} from './resolveAddressFromGps';
import {
  fetchSavedLocationFromServer,
  saveAccountSavedLocation,
} from './savedLocationFirestore';
import type { AccountLocationCollection } from '@/types/savedLocation';

export const MAX_HORIZONTAL_ACCURACY_M = 100;
export const GPS_IMPROVING_MESSAGE = 'Improving GPS accuracy...';

const MAX_ACCURACY_ATTEMPTS = 3;
const ACCURACY_RETRY_DELAY_MS = 900;

export type LocationPermissionAssessment = {
  status: GpsPermissionStatus;
  preciseReduced: boolean;
  canAskAgain: boolean;
  userMessage: string | null;
};

export function isValidGpsCoordinates(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

export function isAcceptableHorizontalAccuracy(
  accuracyMeters: number | null | undefined,
): boolean {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) {
    return true;
  }
  return accuracyMeters <= MAX_HORIZONTAL_ACCURACY_M;
}

function logGpsAccuracy(reading: GpsReading, attempt: number): void {
  console.log('[GPS ACCURACY]', {
    attempt,
    accuracyMeters: reading.accuracy,
    acceptable: isAcceptableHorizontalAccuracy(reading.accuracy),
    maxAllowedM: MAX_HORIZONTAL_ACCURACY_M,
  });
}

function logGpsStaleCheck(reading: GpsReading): void {
  console.log('[GPS STALE CHECK]', {
    positionAgeMs: reading.positionAgeMs,
    maxAgeMs: MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
    stale:
      reading.positionAgeMs != null &&
      reading.positionAgeMs > MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
  });
}

export async function assessLocationPermission(): Promise<LocationPermissionAssessment> {
  const fg = await Location.getForegroundPermissionsAsync();
  let status: GpsPermissionStatus = 'undetermined';
  if (fg.status === Location.PermissionStatus.GRANTED) status = 'granted';
  else if (fg.status === Location.PermissionStatus.DENIED) status = 'denied';

  const iosAccuracy =
    fg.ios && 'accuracy' in fg.ios
      ? (fg.ios as { accuracy?: string }).accuracy
      : undefined;
  const preciseReduced = iosAccuracy === 'reduced';

  let userMessage: string | null = null;
  if (status === 'denied') {
    userMessage = LIVE_GPS_PRECISE_ERROR;
  } else if (preciseReduced) {
    userMessage =
      'Precise Location is off. Enable Settings → Privacy & Security → Location Services → HalfOrder → Precise Location.';
  }

  return {
    status,
    preciseReduced,
    canAskAgain: fg.canAskAgain ?? true,
    userMessage,
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Production GPS read: permission checks, accuracy validation, stale rejection.
 * Never uses getLastKnownPositionAsync or AsyncStorage coordinates.
 */
export async function getProductionGpsReading(options?: {
  /** When true, always fetch a new fix (checkout, Use my location). */
  forceFresh?: boolean;
}): Promise<GpsReading> {
  if (!options?.forceFresh) {
    const cached = getSessionGpsReading();
    if (cached && isValidGpsCoordinates(cached.latitude, cached.longitude)) {
      console.log('[LIVE GPS OVERRIDES CACHE]', { source: 'session_recent', ageMs: Date.now() - (cached.capturedAtMs ?? 0) });
      return cached;
    }
  }

  const assessment = await assessLocationPermission();
  if (assessment.userMessage && assessment.status !== 'granted') {
    throw new LocationPermissionError(assessment.userMessage);
  }

  let permission = assessment.status;
  if (permission !== 'granted') {
    permission = await requestForegroundLocationPermission();
  }
  if (permission !== 'granted') {
    throw new LocationPermissionError(assessment.userMessage ?? LIVE_GPS_PRECISE_ERROR);
  }
  if (assessment.preciseReduced) {
    throw new LocationPermissionError(assessment.userMessage ?? LIVE_GPS_PRECISE_ERROR);
  }

  let lastReading: GpsReading | null = null;

  for (let attempt = 1; attempt <= MAX_ACCURACY_ATTEMPTS; attempt += 1) {
    const reading = await getFreshHighAccuracyGpsReading();
    logGpsAccuracy(reading, attempt);
    logGpsStaleCheck(reading);

    if (!isValidGpsCoordinates(reading.latitude, reading.longitude)) {
      lastReading = reading;
      if (attempt < MAX_ACCURACY_ATTEMPTS) {
        await delay(ACCURACY_RETRY_DELAY_MS);
        continue;
      }
      throw new LocationUnavailableError();
    }

    lastReading = reading;

    if (isAcceptableHorizontalAccuracy(reading.accuracy)) {
      setSessionGpsReading(reading);
      return reading;
    }

    if (attempt < MAX_ACCURACY_ATTEMPTS) {
      await delay(ACCURACY_RETRY_DELAY_MS);
    }
  }

  if (lastReading && isValidGpsCoordinates(lastReading.latitude, lastReading.longitude)) {
    console.log('[GPS ACCURACY]', {
      acceptedDespiteLowAccuracy: true,
      accuracyMeters: lastReading.accuracy,
    });
    setSessionGpsReading(lastReading);
    return lastReading;
  }

  throw new LocationUnavailableError();
}

export async function resolveProductionGpsSavedLocation(options?: {
  forceFresh?: boolean;
}): Promise<{ reading: GpsReading; location: SavedLocation }> {
  const reading = await getProductionGpsReading(options);
  const resolved = await resolveAddressFromGps(reading.latitude, reading.longitude);
  const location = savedLocationFromGpsResolve(
    reading.latitude,
    reading.longitude,
    resolved,
  );
  if (!location) {
    throw new LocationUnavailableError(
      resolved.geocodeError ??
        'Could not resolve your address. Search manually or try again outdoors.',
    );
  }
  return { reading, location };
}

export type DeliveryLocationResolveOptions = {
  required?: boolean;
  persistToProfile?: boolean;
  userId?: string;
  /** Manual Places/geocode selection — used when live GPS is unavailable. */
  manual?: SavedLocation | null;
};

/**
 * Fallback order: fresh GPS → session GPS (<2min) → manual search → saved profile.
 */
export async function resolveDeliveryLocationForOrder(
  options: DeliveryLocationResolveOptions = {},
): Promise<DeliveryAddressBundle> {
  const { required = true, persistToProfile = true, userId = '' } = options;
  const uid = userId.trim();

  try {
    const { reading, location } = await resolveProductionGpsSavedLocation({
      forceFresh: true,
    });
    console.log('[LIVE GPS OVERRIDES CACHE]', { source: 'fresh_gps' });

    if (persistToProfile && uid) {
      try {
        await saveAccountSavedLocation('users', uid, location);
        console.log('[PROFILE LOCATION UPDATED]', { uid, city: location.city });
      } catch {
        /* order can still proceed */
      }
    }

    return {
      lat: reading.latitude,
      lng: reading.longitude,
      address: location.address,
      customerLocation: buildCustomerLocationRecord(reading.latitude, reading.longitude),
    };
  } catch (freshError) {
    const recent = getSessionGpsReading();
    if (recent && isValidGpsCoordinates(recent.latitude, recent.longitude)) {
      const resolved = await resolveAddressFromGps(recent.latitude, recent.longitude);
      const saved = savedLocationFromGpsResolve(
        recent.latitude,
        recent.longitude,
        resolved,
      );
      if (saved?.address.trim()) {
        console.log('[LIVE GPS OVERRIDES CACHE]', { source: 'session_recent_fallback' });
        return {
          lat: recent.latitude,
          lng: recent.longitude,
          address: saved.address,
          customerLocation: buildCustomerLocationRecord(recent.latitude, recent.longitude),
        };
      }
    }

    if (options.manual?.address.trim()) {
      const m = options.manual;
      return {
        lat: m.latitude,
        lng: m.longitude,
        address: m.address,
        customerLocation: buildCustomerLocationRecord(m.latitude, m.longitude),
      };
    }

    if (required) {
      if (freshError instanceof LocationPermissionError) {
        throw new Error(freshError.message);
      }
      throw freshError;
    }
    throw freshError;
  }
}

/** One GPS reconcile per profile session when device moved ≥ 1 km or city changed. */
export async function reconcileProfileLocationIfUserMoved(
  collection: AccountLocationCollection,
  accountId: string,
  persist: (location: SavedLocation) => Promise<unknown>,
  role: AccountLocationRole = 'user',
): Promise<boolean> {
  const sessionKey = `profile_reconcile:${collection}:${accountId}`;
  if (!claimGpsRefreshSession(sessionKey)) return false;

  const server = await fetchSavedLocationFromServer(collection, accountId);
  try {
    const { location } = await resolveProductionGpsSavedLocation({ forceFresh: true });
    if (!server.location || !savedLocationShouldBeReplacedByGps(server.location, location)) {
      return false;
    }
    console.log('[LIVE GPS OVERRIDES CACHE]', {
      reason: 'city_moved',
      oldCity: server.location.city,
      newCity: location.city,
    });
    await persist(location);
    logRoleGps(role, 'city_moved_reconcile', {
      accountId,
      address: location.address,
      city: location.city,
    });
    console.log('[PROFILE LOCATION UPDATED]', {
      role,
      accountId,
      address: location.address,
      city: location.city,
    });
    return true;
  } catch {
    return false;
  }
}

/** Session-guarded refresh for restaurant / driver / startup surfaces. */
export async function refreshGpsIfAllowed(
  sessionKey: string,
  options?: { forceFresh?: boolean },
): Promise<GpsReading | null> {
  const forceFresh = options?.forceFresh === true;
  if (!forceFresh && !claimGpsRefreshSession(sessionKey)) {
    return getSessionGpsReading();
  }
  try {
    return await getProductionGpsReading({ forceFresh });
  } catch {
    return null;
  }
}
