import type { GpsReading } from '@/services/location/gps';
import { MAX_ACCEPTABLE_GPS_CACHE_AGE_MS } from '@/services/location/gps';

/** In-memory recent fix — never used after TTL; not AsyncStorage. */
let recentReading: GpsReading | null = null;
let recentCapturedAtMs = 0;

const refreshClaimedKeys = new Set<string>();

export function setSessionGpsReading(reading: GpsReading): void {
  recentReading = reading;
  recentCapturedAtMs =
    reading.capturedAtMs ?? Date.now();
}

export function getSessionGpsReading(
  maxAgeMs: number = MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
): GpsReading | null {
  if (!recentReading) return null;
  const age = Date.now() - recentCapturedAtMs;
  if (age > maxAgeMs) {
    recentReading = null;
    return null;
  }
  return recentReading;
}

/** One GPS refresh per key per app session (avoids render/focus loops). */
export function claimGpsRefreshSession(key: string): boolean {
  const normalized = key.trim();
  if (!normalized || refreshClaimedKeys.has(normalized)) return false;
  refreshClaimedKeys.add(normalized);
  return true;
}

export function releaseGpsRefreshSession(key: string): void {
  refreshClaimedKeys.delete(key.trim());
}

export function resetGpsSessionCache(): void {
  recentReading = null;
  recentCapturedAtMs = 0;
}
