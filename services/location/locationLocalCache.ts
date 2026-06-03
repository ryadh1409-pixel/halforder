import AsyncStorage from '@react-native-async-storage/async-storage';

import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { MAX_ACCEPTABLE_GPS_CACHE_AGE_MS } from '@/services/location/gps';

const DELIVERY_LOCATION_CACHE_KEY = '@ourfood/delivery_location_cache';
const LIVE_GPS_BIAS_KEY = '@ourfood/live_gps_bias';
export const MARKETPLACE_USER_LOCATION_KEY = '@ourfood/marketplace_user_location';
/** Legacy marketplace home coords — cleared on startup. */
const LEGACY_MARKETPLACE_HOME_KEYS = [
  '@ourfood/marketplace_home_location',
  '@ourfood/home_user_coords',
] as const;

export type MarketplaceUserLocationCache = {
  latitude: number;
  longitude: number;
  addressLine: string;
  capturedAt: number;
};

export type CachedLiveGpsBias = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: number;
};

export function isCachedGpsBiasStale(
  bias: CachedLiveGpsBias,
  maxAgeMs: number = MAX_ACCEPTABLE_GPS_CACHE_AGE_MS,
): boolean {
  if (!Number.isFinite(bias.capturedAt)) return true;
  return Date.now() - bias.capturedAt > maxAgeMs;
}

type ClearCacheOptions = {
  /** Log only for explicit user/profile actions — avoids loop spam. */
  log?: boolean;
  reason?: string;
};

/** Remove all client-side cached delivery/GPS data. */
export async function clearDeliveryLocationCache(
  options?: ClearCacheOptions,
): Promise<void> {
  await AsyncStorage.multiRemove([
    DELIVERY_LOCATION_CACHE_KEY,
    LIVE_GPS_BIAS_KEY,
    MARKETPLACE_USER_LOCATION_KEY,
    ...LEGACY_MARKETPLACE_HOME_KEYS,
  ]);
  if (options?.log) {
    logLocationDebug('[CACHE CLEARED]', {
      reason: options.reason ?? 'manual',
      keys: [
        DELIVERY_LOCATION_CACHE_KEY,
        LIVE_GPS_BIAS_KEY,
        MARKETPLACE_USER_LOCATION_KEY,
        ...LEGACY_MARKETPLACE_HOME_KEYS,
      ],
    });
  }
}

/** Session-fresh marketplace header cache — never used after TTL. */
export async function setMarketplaceUserLocationCache(
  entry: MarketplaceUserLocationCache,
): Promise<void> {
  await AsyncStorage.setItem(MARKETPLACE_USER_LOCATION_KEY, JSON.stringify(entry));
}

export async function readMarketplaceUserLocationCache(): Promise<MarketplaceUserLocationCache | null> {
  const raw = await AsyncStorage.getItem(MARKETPLACE_USER_LOCATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MarketplaceUserLocationCache;
    if (
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      typeof parsed.addressLine !== 'string' ||
      !Number.isFinite(parsed.latitude) ||
      !Number.isFinite(parsed.longitude) ||
      !Number.isFinite(parsed.capturedAt)
    ) {
      return null;
    }
    if (Date.now() - parsed.capturedAt > MAX_ACCEPTABLE_GPS_CACHE_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Store live GPS bias for Places search only — never used as device coordinates after TTL. */
export async function setLiveGpsBiasCache(bias: CachedLiveGpsBias): Promise<void> {
  await AsyncStorage.setItem(LIVE_GPS_BIAS_KEY, JSON.stringify(bias));
}

/** Write Places autocomplete bias only — does not clear delivery cache or log. */
export async function refreshLiveGpsBiasCache(bias: CachedLiveGpsBias): Promise<void> {
  await setLiveGpsBiasCache(bias);
}

/** Returns null if missing, corrupt, or older than {@link MAX_ACCEPTABLE_GPS_CACHE_AGE_MS}. */
export async function readLiveGpsBiasCache(): Promise<CachedLiveGpsBias | null> {
  const raw = await AsyncStorage.getItem(LIVE_GPS_BIAS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedLiveGpsBias;
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      Number.isFinite(parsed.latitude) &&
      Number.isFinite(parsed.longitude)
    ) {
      if (isCachedGpsBiasStale(parsed)) {
        logLocationDebug('[GPS AGE]', {
          action: 'discard_async_storage_bias',
          ageMs: Date.now() - parsed.capturedAt,
        });
        return null;
      }
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}
