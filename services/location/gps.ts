import * as Location from 'expo-location';

import {
  PRODUCTION_GPS_SIMULATOR_MESSAGE,
  shouldBlockSimulatorGps,
} from '@/lib/location/physicalDeviceGps';
import { driverCoordFromGps } from '@/lib/location/coordinates';
import type { DriverLiveCoordinate, GeoCoordinate } from '@/types/location';

import { resolveAddressFromGps } from './resolveAddressFromGps';

export type GpsPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Shown when live GPS or precise location is unavailable (TestFlight / device). */
export const LIVE_GPS_PRECISE_ERROR =
  'Unable to get your live location. Please enable precise location in iPhone settings.';

/** Discard fixes older than this (ms) — real devices may return cached CoreLocation fixes. */
export const MAX_ACCEPTABLE_GPS_CACHE_AGE_MS = 2 * 60 * 1000;

export type GpsReading = GeoCoordinate & {
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  /** When the native fix was recorded (ms since epoch). */
  capturedAtMs?: number;
  /** Age of fix at read time (ms). */
  positionAgeMs?: number | null;
};

export type GpsWatchOptions = {
  accuracy?: Location.Accuracy;
  timeIntervalMs?: number;
  distanceIntervalM?: number;
};

const DEFAULT_WATCH: Required<GpsWatchOptions> = {
  accuracy: Location.Accuracy.Balanced,
  timeIntervalMs: 5000,
  distanceIntervalM: 15,
};

/** Native options — maximumAge/timeout enforced even if Expo types omit them. */
type FreshPositionOptions = Location.LocationOptions & {
  maximumAge?: number;
  timeout?: number;
};

const FRESH_POSITION_BASE: FreshPositionOptions = {
  maximumAge: 0,
  timeout: 15_000,
};

export class LocationPermissionError extends Error {
  constructor(message = LIVE_GPS_PRECISE_ERROR) {
    super(message);
    this.name = 'LocationPermissionError';
  }
}

export class LocationUnavailableError extends Error {
  constructor(message = LIVE_GPS_PRECISE_ERROR) {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

export async function requestForegroundLocationPermission(): Promise<GpsPermissionStatus> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

/** Verify foreground permission without prompting. */
export async function getForegroundPermissionStatus(): Promise<GpsPermissionStatus> {
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

/** @deprecated Use {@link getFreshHighAccuracyGpsReading} for delivery/profile GPS. */
export const FRESH_GPS_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  maximumAge: 0,
  timeout: 15_000,
} as const;

function positionAgeMs(pos: Location.LocationObject): number | null {
  const ts = pos.timestamp;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return Math.max(0, Date.now() - ts);
}

export function isGpsPositionStale(pos: Location.LocationObject): boolean {
  const age = positionAgeMs(pos);
  if (age == null) return false;
  return age > MAX_ACCEPTABLE_GPS_CACHE_AGE_MS;
}

function readingFromPosition(pos: Location.LocationObject): GpsReading {
  const age = positionAgeMs(pos);
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    heading: pos.coords.heading ?? null,
    speed: pos.coords.speed ?? null,
    capturedAtMs: typeof pos.timestamp === 'number' ? pos.timestamp : Date.now(),
    positionAgeMs: age,
  };
}

async function requestCurrentPosition(
  accuracy: Location.Accuracy,
  label: string,
): Promise<Location.LocationObject> {
  console.log('[GPS REQUEST]', { accuracy, label, maximumAge: 0, timeout: 15_000 });

  const position = await Location.getCurrentPositionAsync({
    ...FRESH_POSITION_BASE,
    accuracy,
  });

  const ageMs = positionAgeMs(position);
  console.log('[GPS RESULT]', {
    label,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
  });
  console.log('[GPS STALE CHECK]', {
    ageMs,
    stale: isGpsPositionStale(position),
    maxAgeMs: MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
  });

  return position;
}

/**
 * Fresh live GPS for TestFlight / physical devices.
 * Never uses getLastKnownPositionAsync. Rejects fixes older than 2 minutes.
 */
export async function getFreshHighAccuracyGpsReading(): Promise<GpsReading> {
  if (shouldBlockSimulatorGps()) {
    throw new LocationUnavailableError(PRODUCTION_GPS_SIMULATOR_MESSAGE);
  }

  let permission = await getForegroundPermissionStatus();
  if (permission !== 'granted') {
    permission = await requestForegroundLocationPermission();
  }
  if (permission !== 'granted') {
    throw new LocationPermissionError();
  }

  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    /* Android only */
  }

  let position: Location.LocationObject;

  try {
    position = await requestCurrentPosition(
      Location.Accuracy.BestForNavigation,
      'BestForNavigation',
    );
  } catch (primaryError) {
    console.log('[GPS REQUEST]', {
      fallback: Location.Accuracy.High,
      primaryFailed: true,
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });
    position = await requestCurrentPosition(Location.Accuracy.High, 'High_fallback');
  }

  if (isGpsPositionStale(position)) {
    console.log('[GPS STALE CHECK]', { action: 'discard_stale_fix', retry: true });
    try {
      position = await requestCurrentPosition(
        Location.Accuracy.BestForNavigation,
        'BestForNavigation_retry',
      );
    } catch {
      position = await requestCurrentPosition(
        Location.Accuracy.High,
        'High_fallback_retry',
      );
    }
    if (isGpsPositionStale(position)) {
      throw new LocationUnavailableError();
    }
  }

  return readingFromPosition(position);
}

export async function getCurrentGpsReading(options?: {
  accuracy?: Location.Accuracy;
  fresh?: boolean;
  highAccuracy?: boolean;
}): Promise<GpsReading> {
  if (options?.highAccuracy || options?.fresh !== false) {
    return getFreshHighAccuracyGpsReading();
  }

  const permission = await requestForegroundLocationPermission();
  if (permission !== 'granted') {
    throw new LocationPermissionError();
  }

  const position = await requestCurrentPosition(
    options?.accuracy ?? Location.Accuracy.High,
    'getCurrentGpsReading',
  );
  return readingFromPosition(position);
}

export async function getCurrentGpsReadingSafe(options?: {
  accuracy?: Location.Accuracy;
  highAccuracy?: boolean;
}): Promise<GpsReading | null> {
  try {
    return await getCurrentGpsReading({
      highAccuracy: options?.highAccuracy ?? true,
      fresh: true,
    });
  } catch {
    return null;
  }
}

export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
): Promise<string> {
  const resolved = await resolveAddressFromGps(latitude, longitude);
  return resolved.address;
}

export async function getCityFromCoordinates(
  latitude: number,
  longitude: number,
): Promise<string> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude, longitude });
    return res?.[0]?.city?.trim() || 'Nearby';
  } catch {
    return 'Nearby';
  }
}

export function watchGpsPosition(
  onUpdate: (reading: GpsReading) => void,
  options?: GpsWatchOptions,
): Promise<Location.LocationSubscription> {
  const merged = { ...DEFAULT_WATCH, ...options };
  return Location.watchPositionAsync(
    {
      accuracy: merged.accuracy,
      timeInterval: merged.timeIntervalMs,
      distanceInterval: merged.distanceIntervalM,
    },
    (pos) => onUpdate(readingFromPosition(pos)),
  );
}

export function gpsReadingToDriverCoord(reading: GpsReading): DriverLiveCoordinate {
  return driverCoordFromGps(reading);
}

export async function getUserLocation(): Promise<{ latitude: number; longitude: number }> {
  const reading = await getFreshHighAccuracyGpsReading();
  return { latitude: reading.latitude, longitude: reading.longitude };
}

export async function getUserLocationSafe(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const reading = await getCurrentGpsReadingSafe({ highAccuracy: true });
  if (!reading) return null;
  return { latitude: reading.latitude, longitude: reading.longitude };
}
