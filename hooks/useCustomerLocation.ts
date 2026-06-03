import { useCallback, useEffect, useState } from 'react';

import type { CustomerLocationRecord } from '@/types/location';
import { useAuth } from '@/services/AuthContext';
import {
  GPS_IMPROVING_MESSAGE,
  getProductionGpsReading,
  resolveProductionGpsSavedLocation,
} from '@/services/location/productionGps';
import { LIVE_GPS_PRECISE_ERROR } from '@/services/location/gps';
import {
  claimGpsRefreshSession,
  getSessionGpsReading,
} from '@/services/location/gpsSession';
import {
  requestForegroundLocationPermission,
  type GpsPermissionStatus,
  type GpsReading,
} from '@/services/location/gps';

export type CustomerLocationState = {
  reading: GpsReading | null;
  address: string | null;
  permission: GpsPermissionStatus;
  loading: boolean;
  improving: boolean;
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
    improving: false,
    error: null,
  });

  const refresh = useCallback(
    async (forceFresh = false): Promise<GpsReading | null> => {
      const uid = user?.uid?.trim() ?? 'guest';
      const sessionKey = `customer:${uid}`;

      if (!forceFresh) {
        if (!claimGpsRefreshSession(sessionKey)) {
          const recent = getSessionGpsReading();
          if (recent) {
            setState((s) => ({
              ...s,
              reading: recent,
              loading: false,
              improving: false,
              error: null,
            }));
            return recent;
          }
        }
      }

      setState((s) => ({
        ...s,
        loading: true,
        improving: true,
        error: null,
      }));

      const permission = await requestForegroundLocationPermission();
      if (permission !== 'granted') {
        setState({
          reading: null,
          address: null,
          permission,
          loading: false,
          improving: false,
          error: LIVE_GPS_PRECISE_ERROR,
        });
        return null;
      }

      try {
        const { reading, location } = await resolveProductionGpsSavedLocation({
          forceFresh,
        });
        setState({
          reading,
          address: location.address,
          permission: 'granted',
          loading: false,
          improving: false,
          error: null,
        });
        return reading;
      } catch {
        try {
          const reading = await getProductionGpsReading({ forceFresh });
          setState({
            reading,
            address: null,
            permission: 'granted',
            loading: false,
            improving: false,
            error: 'GPS found but address could not be resolved. Set your address in Profile.',
          });
          return reading;
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : LIVE_GPS_PRECISE_ERROR;
          setState({
            reading: null,
            address: null,
            permission,
            loading: false,
            improving: false,
            error: msg,
          });
          return null;
        }
      }
    },
    [user?.uid],
  );

  useEffect(() => {
    if (!autoFetch) return;
    void refresh(false);
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
    improvingMessage: state.improving ? GPS_IMPROVING_MESSAGE : null,
    refresh,
    toCustomerLocationRecord,
    coords: state.reading
      ? { lat: state.reading.latitude, lng: state.reading.longitude }
      : null,
  };
}
