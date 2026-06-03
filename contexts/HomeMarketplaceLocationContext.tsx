import { useAuth } from '@/services/AuthContext';
import { getCurrentGpsReading } from '@/services/location/gps';
import { runDedupedGpsRequest } from '@/services/location/gpsRequestGate';
import { getSessionGpsReading } from '@/services/location/gpsSession';
import { setMarketplaceUserLocationCache } from '@/services/location/locationLocalCache';
import { resolveAddressFromGps } from '@/services/location/resolveAddressFromGps';
import type { ResolvedAddressFromGps } from '@/services/location/resolveAddressFromGps';
import type { GpsReading } from '@/services/location/gps';
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

  const applySessionCoordsIfFresh = useCallback(async (): Promise<boolean> => {
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

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLocationLoading(true);

    try {
      try {
        const resolved = await resolveHomeLocationFromGps();
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
    let cancelled = false;
    void (async () => {
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
  }, [user?.uid]);

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
    }),
    [userCoords, addressLine, locationReady, locationLoading, refreshLocation],
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
