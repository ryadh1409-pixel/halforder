import { useAuth } from '@/services/AuthContext';
import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { getCurrentGpsReading } from '@/services/location/gps';
import { runDedupedGpsRequest } from '@/services/location/gpsRequestGate';
import { getSessionGpsReading } from '@/services/location/gpsSession';
import { subscribeCanonicalDeliveryLocation } from '@/services/location/canonicalDeliveryLocationBridge';
import {
  MARKETPLACE_USER_LOCATION_KEY,
  setMarketplaceUserLocationCache,
} from '@/services/location/locationLocalCache';
import { resolveAddressFromGps } from '@/services/location/resolveAddressFromGps';
import type { ResolvedAddressFromGps } from '@/services/location/resolveAddressFromGps';
import type { GpsReading } from '@/services/location/gps';
import type { SavedLocation } from '@/types/savedLocation';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export const HOME_LOCATION_UNAVAILABLE_LABEL = 'Enable location access';

export type HomeUserCoords = { lat: number; lng: number };

type HomeMarketplaceLocationValue = {
  userCoords: HomeUserCoords | null;
  addressLine: string;
  locationReady: boolean;
  locationLoading: boolean;
  refreshLocation: () => Promise<void>;
  /** Overwrite GPS/cache with canonical `users/{uid}.location`. */
  applyCanonicalDeliveryLocation: (location: SavedLocation) => Promise<void>;
};

const HomeMarketplaceLocationContext =
  createContext<HomeMarketplaceLocationValue | null>(null);

function formatHomeAddressLine(
  resolved: ResolvedAddressFromGps,
  reading: GpsReading,
): string {
  if (resolved.geocoded && resolved.address.trim()) {
    const parts = resolved.address.split(',').map((p) => p.trim()).filter(Boolean);
    const street = parts[0] ?? resolved.address.trim();
    const city = resolved.city?.trim();
    if (city && !street.toLowerCase().includes(city.toLowerCase())) {
      return `${street} · ${city}`;
    }
    return parts.length > 2 ? `${street} · ${parts[parts.length - 1]}` : resolved.address.trim();
  }
  if (resolved.city?.trim()) return resolved.city.trim();
  return `${reading.latitude.toFixed(4)}, ${reading.longitude.toFixed(4)}`;
}

function formatCanonicalAddressLine(location: SavedLocation): string {
  const full =
    location.formattedAddress?.trim() || location.address.trim();
  if (!full) return HOME_LOCATION_UNAVAILABLE_LABEL;
  return full;
}

async function resolveHomeLocationFromGps(): Promise<{
  coords: HomeUserCoords;
  addressLine: string;
}> {
  const reading = await runDedupedGpsRequest('home_marketplace_gps', () =>
    getCurrentGpsReading({ highAccuracy: true, fresh: true }),
  );
  const resolved = await resolveAddressFromGps(reading.latitude, reading.longitude);
  const coords = { lat: reading.latitude, lng: reading.longitude };
  const addressLine = formatHomeAddressLine(resolved, reading);
  await setMarketplaceUserLocationCache({
    latitude: reading.latitude,
    longitude: reading.longitude,
    addressLine,
    capturedAt: Date.now(),
  });
  return { coords, addressLine };
}

export function HomeMarketplaceLocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [userCoords, setUserCoords] = useState<HomeUserCoords | null>(null);
  const [addressLine, setAddressLine] = useState(HOME_LOCATION_UNAVAILABLE_LABEL);
  const [locationReady, setLocationReady] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const refreshInFlightRef = useRef(false);
  /** Once the user saves a delivery pin, GPS refresh must not overwrite it. */
  const preferCanonicalRef = useRef(false);
  const addressLineRef = useRef(addressLine);
  const userCoordsRef = useRef(userCoords);
  addressLineRef.current = addressLine;
  userCoordsRef.current = userCoords;

  const applyCanonicalDeliveryLocation = useCallback(
    async (location: SavedLocation) => {
      const line = formatCanonicalAddressLine(location);
      if (line === HOME_LOCATION_UNAVAILABLE_LABEL) return;
      if (
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        return;
      }

      const prevCoords = userCoordsRef.current;
      const sameCoords =
        prevCoords != null &&
        Math.abs(prevCoords.lat - location.latitude) < 1e-7 &&
        Math.abs(prevCoords.lng - location.longitude) < 1e-7;
      const sameLine = addressLineRef.current === line;
      if (preferCanonicalRef.current && sameCoords && sameLine) {
        return;
      }

      preferCanonicalRef.current = true;
      const coords = { lat: location.latitude, lng: location.longitude };
      setUserCoords(coords);
      setAddressLine(line);
      setLocationReady(true);
      setLocationLoading(false);

      await setMarketplaceUserLocationCache({
        latitude: location.latitude,
        longitude: location.longitude,
        addressLine: line,
        capturedAt: Date.now(),
      });

      logLocationDebug('[MARKETPLACE CONTEXT] applied canonical delivery', {
        addressLine: line,
        coordinates: coords,
        asyncStorageKey: MARKETPLACE_USER_LOCATION_KEY,
      });
    },
    [],
  );

  const applySessionCoordsIfFresh = useCallback(async (): Promise<boolean> => {
    if (preferCanonicalRef.current) return false;
    const recent = getSessionGpsReading();
    if (!recent) return false;
    setUserCoords({ lat: recent.latitude, lng: recent.longitude });
    try {
      const geocoded = await resolveAddressFromGps(recent.latitude, recent.longitude);
      const line = formatHomeAddressLine(geocoded, recent);
      setAddressLine(line);
      await setMarketplaceUserLocationCache({
        latitude: recent.latitude,
        longitude: recent.longitude,
        addressLine: line,
        capturedAt: Date.now(),
      });
    } catch {
      setAddressLine(HOME_LOCATION_UNAVAILABLE_LABEL);
    }
    return true;
  }, []);

  const refreshLocation = useCallback(async () => {
    if (Platform.OS === 'web') {
      setUserCoords(null);
      setAddressLine(HOME_LOCATION_UNAVAILABLE_LABEL);
      setLocationReady(true);
      setLocationLoading(false);
      return;
    }

    // Do not clobber the saved delivery pin with a fresh GPS reverse-geocode.
    if (preferCanonicalRef.current) {
      logLocationDebug('[MARKETPLACE CONTEXT] skip GPS refresh (canonical pin active)');
      setLocationLoading(false);
      setLocationReady(true);
      return;
    }

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLocationLoading(true);

    try {
      try {
        const resolved = await resolveHomeLocationFromGps();
        if (preferCanonicalRef.current) return;
        setUserCoords(resolved.coords);
        setAddressLine(resolved.addressLine);
        return;
      } catch {
        /* fall through — session GPS only (no stale demo cache for coords) */
      }

      if (await applySessionCoordsIfFresh()) {
        return;
      }

      setUserCoords(null);
      setAddressLine(HOME_LOCATION_UNAVAILABLE_LABEL);
    } finally {
      setLocationLoading(false);
      refreshInFlightRef.current = false;
    }
  }, [applySessionCoordsIfFresh]);

  const refreshLocationRef = useRef(refreshLocation);
  refreshLocationRef.current = refreshLocation;

  useEffect(() => {
    return subscribeCanonicalDeliveryLocation((location) => {
      void applyCanonicalDeliveryLocation(location);
    });
  }, [applyCanonicalDeliveryLocation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const uid = user?.uid?.trim();
      // Only clear the canonical lock on logout — resetting it on remount races GPS
      // refresh against the in-flight profile fetch and can flash a stale city pin.
      if (!uid || user?.isAnonymous) {
        preferCanonicalRef.current = false;
        await refreshLocationRef.current();
        if (!cancelled) {
          setLocationReady(true);
          setLocationLoading(false);
          refreshInFlightRef.current = false;
        }
        return;
      }
      try {
        const { fetchSavedLocationFromServer } = await import(
          '@/services/location/savedLocationFirestore'
        );
        const saved = await fetchSavedLocationFromServer('users', uid);
        if (!cancelled && saved.location) {
          await applyCanonicalDeliveryLocation(saved.location);
          return;
        }
      } catch {
        /* fall through to GPS */
      }
      if (preferCanonicalRef.current) {
        if (!cancelled) {
          setLocationReady(true);
          setLocationLoading(false);
        }
        return;
      }
      await refreshLocationRef.current();
      if (!cancelled) {
        setLocationReady(true);
        setLocationLoading(false);
        refreshInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.isAnonymous, applyCanonicalDeliveryLocation]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void refreshLocationRef.current().finally(() => {
        setLocationReady(true);
        setLocationLoading(false);
        refreshInFlightRef.current = false;
      });
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const value = useMemo(
    (): HomeMarketplaceLocationValue => ({
      userCoords,
      addressLine,
      locationReady,
      locationLoading,
      refreshLocation,
      applyCanonicalDeliveryLocation,
    }),
    [
      userCoords,
      addressLine,
      locationReady,
      locationLoading,
      refreshLocation,
      applyCanonicalDeliveryLocation,
    ],
  );

  return (
    <HomeMarketplaceLocationContext.Provider value={value}>
      {children}
    </HomeMarketplaceLocationContext.Provider>
  );
}

export function useHomeMarketplaceLocation(): HomeMarketplaceLocationValue {
  const ctx = useContext(HomeMarketplaceLocationContext);
  if (!ctx) {
    throw new Error(
      'useHomeMarketplaceLocation must be used within HomeMarketplaceLocationProvider',
    );
  }
  return ctx;
}
