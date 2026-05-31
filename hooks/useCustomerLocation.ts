import { useCallback, useEffect, useState } from 'react';

import type { CustomerLocationRecord } from '@/types/location';
import { useAuth } from '@/services/AuthContext';
import {
  getCurrentGpsReadingSafe,
  persistCustomerLocation,
  requestForegroundLocationPermission,
  reverseGeocodeAddress,
  type GpsPermissionStatus,
  type GpsReading,
} from '@/services/location';

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

    const reading = await getCurrentGpsReadingSafe();
    if (!reading) {
      setState({
        reading: null,
        address: null,
        permission,
        loading: false,
        error: 'Could not determine your location.',
      });
      return null;
    }

    const address = await reverseGeocodeAddress(reading.latitude, reading.longitude);
    const uid = user?.uid?.trim();
    if (uid) {
      try {
        await persistCustomerLocation(uid, reading.latitude, reading.longitude);
      } catch {
        /* profile sync is best-effort */
      }
    }

    setState({
      reading,
      address,
      permission,
      loading: false,
      error: null,
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
