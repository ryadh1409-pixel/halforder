import * as Location from 'expo-location';

import type { DriverLiveCoordinate, GeoCoordinate } from '@/types/location';
import { driverCoordFromGps } from '@/lib/location/coordinates';

import {
  CURRENT_LOCATION_LABEL,
  resolveAddressFromGps,
} from './resolveAddressFromGps';

export type GpsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type GpsReading = GeoCoordinate & {
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
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

export class LocationPermissionError extends Error {
  constructor(message = 'Location permission denied') {
    super(message);
    this.name = 'LocationPermissionError';
  }
}

export class LocationUnavailableError extends Error {
  constructor(message = 'Could not determine your location') {
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

/** Options for a fresh device fix (no stale cached coordinates). */
export const FRESH_GPS_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
} as const;

export async function getCurrentGpsReading(options?: {
  accuracy?: Location.Accuracy;
  /** When true (default), prefer a new satellite/network fix over cached position. */
  fresh?: boolean;
}): Promise<GpsReading> {
  const permission = await requestForegroundLocationPermission();
  if (permission !== 'granted') {
    throw new LocationPermissionError();
  }

  const useFresh = options?.fresh !== false;
  if (useFresh) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      /* iOS — not applicable */
    }
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy:
      options?.accuracy ??
      (useFresh ? FRESH_GPS_OPTIONS.accuracy : Location.Accuracy.High),
  });

  const reading: GpsReading = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null,
    heading: location.coords.heading ?? null,
    speed: location.coords.speed ?? null,
  };

  if (__DEV__) {
    console.log('[GPS READING]', {
      latitude: reading.latitude,
      longitude: reading.longitude,
      accuracy: reading.accuracy,
      fresh: useFresh,
    });
  }

  return reading;
}

/** Privacy-safe: returns null instead of throwing when denied/unavailable. */
export async function getCurrentGpsReadingSafe(options?: {
  accuracy?: Location.Accuracy;
}): Promise<GpsReading | null> {
  try {
    return await getCurrentGpsReading(options);
  } catch {
    return null;
  }
}

/**
 * Resolve display address via Google Geocoding API with safe fallback.
 * Never returns a stale Firestore or device-cache city string.
 */
export async function reverseGeocodeAddress(
  latitude: number,
  longitude: number,
): Promise<string> {
  const resolved = await resolveAddressFromGps(latitude, longitude);
  return resolved.address || CURRENT_LOCATION_LABEL;
}

/** Reverse geocode to city only (never expose exact address in UI). */
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
    (pos) => {
      onUpdate({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
      });
    },
  );
}

export function gpsReadingToDriverCoord(reading: GpsReading): DriverLiveCoordinate {
  return driverCoordFromGps(reading);
}

/** @deprecated Use getCurrentGpsReading — kept for existing imports. */
export async function getUserLocation(): Promise<{ latitude: number; longitude: number }> {
  const reading = await getCurrentGpsReading();
  return { latitude: reading.latitude, longitude: reading.longitude };
}

/** @deprecated Use getCurrentGpsReadingSafe */
export async function getUserLocationSafe(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const reading = await getCurrentGpsReadingSafe();
  if (!reading) return null;
  return { latitude: reading.latitude, longitude: reading.longitude };
}
