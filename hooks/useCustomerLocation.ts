import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

import type { CustomerLocationRecord } from '@/types/location';
import { useAuth } from '@/services/AuthContext';
import {
  CURRENT_LOCATION_LABEL,
  resolveAddressFromGps,
} from '@/services/location/resolveAddressFromGps';
import {
  getCurrentGpsReading,
  persistCustomerLocation,
  requestForegroundLocationPermission,
  type GpsPermissionStatus,
  type GpsReading,
} from '@/services/location';
import { persistGpsCoordinatesOnly } from '@/services/profile/savedLocation';

export type CustomerLocationState = {
  reading: GpsReading | null;
  address: string | null;
  permission: GpsPermissionStatus;
  loading: boolean;
  error: string | null;
};

export function useCustomerLocation(options?: { autoFetch?: boolean }) {
  const { user } = useAuth();
  const autoFetch = options?.autoFetch !== false;
  const [state, setState] = useState<CustomerLocationState>({
    reading: null,
    address: null,
    permission: 'undetermined',
    loading: autoFetch,
    error: null,
  });

  const refresh = useCallback(async (): Promise<GpsReading | null> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const permission = await requestForegroundLocationPermission();
    if (permission !== 'granted') {
      setState({
        reading: null,
        address: null,
        permission,
        loading: false,
        error: 'Location permission is required for delivery.',
      });
      return null;
    }

    let reading: GpsReading;
    try {
      reading = await getCurrentGpsReading({
        accuracy: Location.Accuracy.BestForNavigation,
        fresh: true,
      });
    } catch {
      setState({
        reading: null,
        address: null,
        permission,
        loading: false,
        error: 'Could not determine your location.',
      });
      return null;
    }

    const resolved = await resolveAddressFromGps(reading.latitude, reading.longitude);
    const address = resolved.address || CURRENT_LOCATION_LABEL;
    const uid = user?.uid?.trim();
    if (uid) {
      try {
        await persistCustomerLocation(uid, reading.latitude, reading.longitude);
        if (resolved.geocoded) {
          const { saveUserSavedLocation } = await import('@/services/profile/savedLocation');
          await saveUserSavedLocation(uid, {
            address: resolved.address,
            latitude: reading.latitude,
            longitude: reading.longitude,
            ...(resolved.placeId ? { placeId: resolved.placeId } : {}),
          });
        } else {
          await persistGpsCoordinatesOnly(uid, reading.latitude, reading.longitude);
        }
      } catch {
        /* profile sync is best-effort */
      }
    }

    setState({
      reading,
      address,
      permission,
      loading: false,
      error: resolved.geocoded
        ? null
        : (resolved.geocodeError ??
            'Showing your GPS position. Add a Google Maps API key for street addresses.'),
    });
    return reading;
  }, [user?.uid]);

  useEffect(() => {
    if (!autoFetch) return;
    void refresh();
  }, [autoFetch, refresh]);

  const toCustomerLocationRecord = useCallback((): CustomerLocationRecord | null => {
    if (!state.reading) return null;
    return {
      latitude: state.reading.latitude,
      longitude: state.reading.longitude,
      timestamp: Date.now(),
    };
  }, [state.reading]);

  return {
    ...state,
    refresh,
    toCustomerLocationRecord,
    coords: state.reading
      ? { lat: state.reading.latitude, lng: state.reading.longitude }
      : null,
  };
}
