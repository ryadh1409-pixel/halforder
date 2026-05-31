import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { DriverLiveCoordinate } from '@/types/location';
import {
  gpsReadingToDriverCoord,
  requestForegroundLocationPermission,
  resetDriverLocationThrottle,
  syncDriverLiveLocation,
  watchGpsPosition,
  type GpsReading,
} from '@/services/location';

export type DriverLocationTrackingState = {
  current: DriverLiveCoordinate | null;
  permissionGranted: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
};

/**
 * Background-safe foreground GPS watch for active deliveries.
 * Throttled Firestore writes via syncDriverLiveLocation.
 */
export function useDriverLocationTracking(
  orderId: string | null | undefined,
  driverId: string | null | undefined,
  enabled = true,
): DriverLocationTrackingState {
  const [current, setCurrent] = useState<DriverLiveCoordinate | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const watchRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web' || !orderId?.trim() || !driverId?.trim()) {
      return undefined;
    }

    let mounted = true;
    const oid = orderId.trim();
    const did = driverId.trim();

    void (async () => {
      const permission = await requestForegroundLocationPermission();
      if (!mounted || permission !== 'granted') return;
      setPermissionGranted(true);

      try {
        const subscription = await watchGpsPosition(
          (reading: GpsReading) => {
            if (!mounted) return;
            const coord = gpsReadingToDriverCoord(reading);
            setCurrent(coord);
            setSyncing(true);
            void syncDriverLiveLocation(oid, did, coord)
              .then((written) => {
                if (!mounted) return;
                if (written) setLastSyncedAt(Date.now());
              })
              .finally(() => {
                if (mounted) setSyncing(false);
              });
          },
          {
            timeIntervalMs: 5000,
            distanceIntervalM: 10,
          },
        );
        watchRef.current = subscription;
      } catch {
        /* watch failed */
      }
    })();

    return () => {
      mounted = false;
      watchRef.current?.remove();
      watchRef.current = null;
      resetDriverLocationThrottle(oid, did);
    };
  }, [orderId, driverId, enabled]);

  return { current, permissionGranted, syncing, lastSyncedAt };
}
