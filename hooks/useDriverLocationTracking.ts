import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { DriverLiveCoordinate } from '@/types/location';
import {
  ensureDriverLiveSharing,
  isDriverLiveSharingActive,
  subscribeDriverLiveSharing,
} from '@/services/location/driverLiveSharingSession';
import { getForegroundPermissionStatus } from '@/services/location/gps';

export type DriverLocationTrackingState = {
  current: DriverLiveCoordinate | null;
  permissionGranted: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
};

/**
 * Subscribe to the driver-shell live sharing session for map display.
 * Publishing is owned by DriverLiveSharingHost / post-accept Enable flow.
 * If OS permission is already granted and sharing was enabled, silently resumes.
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

  useEffect(() => {
    if (!enabled || Platform.OS === 'web' || !orderId?.trim() || !driverId?.trim()) {
      setCurrent(null);
      return undefined;
    }

    const oid = orderId.trim();
    const did = driverId.trim();
    let mounted = true;

    const unsub = subscribeDriverLiveSharing((coord) => {
      if (!mounted) return;
      setCurrent(coord);
      if (coord) {
        setPermissionGranted(true);
        setLastSyncedAt(Date.now());
        setSyncing(false);
      }
    });

    void (async () => {
      setSyncing(true);
      try {
        if (!isDriverLiveSharingActive(oid, did)) {
          await ensureDriverLiveSharing(oid, did);
        }
        if (mounted) {
          const perm = await getForegroundPermissionStatus();
          setPermissionGranted(
            isDriverLiveSharingActive(oid, did) || perm === 'granted',
          );
        }
      } finally {
        if (mounted) setSyncing(false);
      }
    })();

    return () => {
      mounted = false;
      unsub();
      // Do not stop the shell session when leaving the Active screen —
      // sharing continues until delivered / cancelled / unassigned.
    };
  }, [orderId, driverId, enabled]);

  return { current, permissionGranted, syncing, lastSyncedAt };
}
