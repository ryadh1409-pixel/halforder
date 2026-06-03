import * as Location from 'expo-location';

import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { savedLocationShouldBeReplacedByGps } from '@/lib/location/savedLocationReconcile';
import type { AccountLocationRole } from '@/services/location/accountLocationRole';
import { logRoleGps } from '@/services/location/accountLocationRole';
import type { DeliveryAddressBundle } from '@/types/location';
import type { AccountLocationCollection, SavedLocation } from '@/types/savedLocation';

import { buildCustomerLocationRecord } from './customerLocationRecord';
import {
  getFreshHighAccuracyGpsReading,
  getForegroundPermissionStatus,
  LIVE_GPS_PRECISE_ERROR,
  LocationPermissionError,
  LocationUnavailableError,
  MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
  requestForegroundLocationPermission,
  type GpsPermissionStatus,
  type GpsReading,
} from './gps';
import { runDedupedGpsRequest } from './gpsRequestGate';
import { claimGpsRefreshSession, getSessionGpsReading, setSessionGpsReading } from './gpsSession';
import {
  resolveAddressFromGps,
  savedLocationFromGpsResolve,
} from './resolveAddressFromGps';
import {
  fetchSavedLocationFromServer,
  saveAccountSavedLocation,
} from './savedLocationFirestore';

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

function isUsableSavedLocation(
  location: SavedLocation | null | undefined,
): location is SavedLocation {
  if (!location?.address?.trim()) return false;
  return isValidGpsCoordinates(location.latitude, location.longitude);
}

function bundleFromSavedLocation(location: SavedLocation): DeliveryAddressBundle {
  return {
    lat: location.latitude,
    lng: location.longitude,
    address: location.address.trim(),
    customerLocation: buildCustomerLocationRecord(
      location.latitude,
      location.longitude,
    ),
  };
}

function logGpsAccuracy(reading: GpsReading, attempt: number): void {
  logLocationDebug('[GPS ACCURACY]', {
    attempt,
    accuracyMeters: reading.accuracy,
    acceptable: isAcceptableHorizontalAccuracy(reading.accuracy),
    maxAllowedM: MAX_HORIZONTAL_ACCURACY_M,
  });
}

function logGpsStaleCheck(reading: GpsReading): void {
  logLocationDebug('[GPS STALE CHECK]', {
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

async function readProductionGpsReadingUncached(options?: {
  forceFresh?: boolean;
}): Promise<GpsReading> {
  if (!options?.forceFresh) {
    const cached = getSessionGpsReading();
    if (cached && isValidGpsCoordinates(cached.latitude, cached.longitude)) {
      logLocationDebug('[LIVE GPS OVERRIDES CACHE]', {
        source: 'session_recent',
        ageMs: Date.now() - (cached.capturedAtMs ?? 0),
      });
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
    logLocationDebug('[GPS ACCURACY]', {
      acceptedDespiteLowAccuracy: true,
      accuracyMeters: lastReading.accuracy,
    });
    setSessionGpsReading(lastReading);
    return lastReading;
  }

  throw new LocationUnavailableError();
}

/**
 * Production GPS read: permission checks, accuracy validation, stale rejection.
 * Never uses getLastKnownPositionAsync or AsyncStorage coordinates.
 */
export async function getProductionGpsReading(options?: {
  forceFresh?: boolean;
}): Promise<GpsReading> {
  const key = options?.forceFresh ? 'production_gps:fresh' : 'production_gps:session';
  return runDedupedGpsRequest(key, () => readProductionGpsReadingUncached(options));
}

export async function resolveProductionGpsSavedLocation(options?: {
  forceFresh?: boolean;
}): Promise<{ reading: GpsReading; location: SavedLocation }> {
  const key = options?.forceFresh
    ? 'production_gps_saved:fresh'
    : 'production_gps_saved:session';

  return runDedupedGpsRequest(key, async () => {
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
  });
}

export type DeliveryLocationResolveOptions = {
  required?: boolean;
  persistToProfile?: boolean;
  userId?: string;
  /** Saved Firestore profile — used only after live GPS + geocode fail. */
  savedProfile?: SavedLocation | null;
  /** Manual Places/geocode selection — last resort before error. */
  manual?: SavedLocation | null;
};

async function resolveSavedProfileForUser(
  uid: string,
  explicit: SavedLocation | null | undefined,
): Promise<SavedLocation | null> {
  if (explicit !== undefined) {
    return isUsableSavedLocation(explicit) ? explicit : null;
  }
  if (!uid) return null;
  try {
    const server = await fetchSavedLocationFromServer('users', uid);
    return isUsableSavedLocation(server.location) ? server.location : null;
  } catch {
    return null;
  }
}

/**
 * Fallback: live GPS + reverse geocode → session GPS + geocode → saved profile → manual.
 */
export async function resolveDeliveryLocationForOrder(
  options: DeliveryLocationResolveOptions = {},
): Promise<DeliveryAddressBundle> {
  const { required = true, persistToProfile = true, userId = '' } = options;
  const uid = userId.trim();

  try {
    const { reading, location } = await runDedupedGpsRequest(
      'delivery:live_gps',
      () => resolveProductionGpsSavedLocation({ forceFresh: true }),
    );
    logLocationDebug('[DELIVERY LOCATION]', { source: 'live_gps' });

    if (persistToProfile && uid) {
      try {
        await saveAccountSavedLocation('users', uid, location);
      } catch {
        /* order can still proceed */
      }
    }

    return bundleFromSavedLocation(location);
  } catch (freshError) {
    const recent = getSessionGpsReading();
    if (recent && isValidGpsCoordinates(recent.latitude, recent.longitude)) {
      const resolved = await resolveAddressFromGps(recent.latitude, recent.longitude);
      const geocoded = savedLocationFromGpsResolve(
        recent.latitude,
        recent.longitude,
        resolved,
      );
      if (geocoded?.address.trim()) {
        logLocationDebug('[DELIVERY LOCATION]', { source: 'session_gps_geocode' });
        return bundleFromSavedLocation(geocoded);
      }
    }

    const savedProfile = await resolveSavedProfileForUser(uid, options.savedProfile);
    if (savedProfile) {
      logLocationDebug('[DELIVERY LOCATION]', { source: 'saved_profile' });
      return bundleFromSavedLocation(savedProfile);
    }

    if (isUsableSavedLocation(options.manual)) {
      logLocationDebug('[DELIVERY LOCATION]', { source: 'manual_search' });
      return bundleFromSavedLocation(options.manual);
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
    await persist(location);
    logRoleGps(role, 'city_moved_reconcile', {
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
