/**
 * Foreground live GPS sharing for one active driver delivery.
 * Publishes real GPS only — no simulated movement.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';

import type { DriverLiveCoordinate } from '@/types/location';
import { db } from '@/services/firebase';
import {
  getCurrentGpsReadingSafe,
  getForegroundPermissionStatus,
  gpsReadingToDriverCoord,
  requestForegroundLocationPermission,
  watchGpsPosition,
  type GpsReading,
} from '@/services/location/gps';
import {
  resetDriverLocationThrottle,
  syncDriverLiveLocation,
} from '@/services/location/driverTracking';
import { logLocationDebug } from '@/lib/location/locationDebugLog';

const ENABLED_ORDER_KEY = '@halforder/driverLiveShareOrderId';

async function readEnabledOrderId(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(ENABLED_ORDER_KEY);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

async function writeEnabledOrderId(orderId: string | null): Promise<void> {
  try {
    if (!orderId) await AsyncStorage.removeItem(ENABLED_ORDER_KEY);
    else await AsyncStorage.setItem(ENABLED_ORDER_KEY, orderId);
  } catch {
    /* ignore */
  }
}

export type DriverLiveSharingStopReason =
  | 'delivered'
  | 'cancelled'
  | 'unassigned'
  | 'manual'
  | 'replaced'
  | 'declined'
  | 'permission_denied'
  | 'logout';

type Listener = (coord: DriverLiveCoordinate | null) => void;

type SessionState = {
  orderId: string;
  driverId: string;
  current: DriverLiveCoordinate | null;
  permissionGranted: boolean;
  running: boolean;
};

let watchSub: { remove: () => void } | null = null;
let session: SessionState | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  const coord = session?.current ?? null;
  for (const l of listeners) {
    try {
      l(coord);
    } catch {
      /* ignore listener errors */
    }
  }
}

function setSession(next: SessionState | null): void {
  session = next;
  emit();
}

/** Best-effort privacy cleanup — stop exposing live GPS after the delivery ends. */
async function clearLiveSharingArtifacts(
  orderId: string,
  driverId: string,
): Promise<void> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return;

  try {
    await updateDoc(doc(db, 'orders', oid), {
      driverLocation: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* rules may require coords-only patches — stop publishing is enough */
  }

  try {
    await updateDoc(doc(db, 'drivers', did), {
      liveLocation: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* ignore */
  }

  // live_locations/{orderId} delete is denied by rules — leave last point stale;
  // viewers must only render driver GPS while the order is active.
}

export function getDriverLiveSharingSession(): SessionState | null {
  return session;
}

export function isDriverLiveSharingActive(
  orderId?: string | null,
  driverId?: string | null,
): boolean {
  if (!session?.running) return false;
  if (orderId && session.orderId !== orderId.trim()) return false;
  if (driverId && session.driverId !== driverId.trim()) return false;
  return true;
}

export function subscribeDriverLiveSharing(listener: Listener): () => void {
  listeners.add(listener);
  listener(session?.current ?? null);
  return () => {
    listeners.delete(listener);
  };
}

async function writeCoord(
  orderId: string,
  driverId: string,
  coord: DriverLiveCoordinate,
): Promise<void> {
  if (!session?.running) return;
  if (session.orderId !== orderId || session.driverId !== driverId) return;
  session = { ...session, current: coord };
  emit();
  try {
    await syncDriverLiveLocation(orderId, driverId, coord, { force: true });
  } catch (e) {
    logLocationDebug('[DRIVER LIVE SHARE] write failed', {
      orderId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Start continuous foreground GPS for an active delivery.
 * Returns false if permission is denied or platform unsupported.
 */
export async function startDriverLiveSharing(
  orderId: string,
  driverId: string,
): Promise<boolean> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return false;
  if (Platform.OS === 'web') return false;

  if (session?.running && session.orderId === oid && session.driverId === did) {
    return session.permissionGranted;
  }

  if (session?.running) {
    await stopDriverLiveSharing('replaced');
  }

  let permission = await getForegroundPermissionStatus();
  if (permission !== 'granted') {
    permission = await requestForegroundLocationPermission();
  }
  if (permission !== 'granted') {
    setSession({
      orderId: oid,
      driverId: did,
      current: null,
      permissionGranted: false,
      running: false,
    });
    logLocationDebug('[DRIVER LIVE SHARE] permission denied', { orderId: oid });
    return false;
  }

  setSession({
    orderId: oid,
    driverId: did,
    current: null,
    permissionGranted: true,
    running: true,
  });
  await writeEnabledOrderId(oid);

  const seed = await getCurrentGpsReadingSafe({ highAccuracy: true });
  if (seed && session?.running && session.orderId === oid) {
    await writeCoord(oid, did, gpsReadingToDriverCoord(seed));
  }

  try {
    watchSub?.remove();
    watchSub = await watchGpsPosition(
      (reading: GpsReading) => {
        if (!session?.running || session.orderId !== oid) return;
        void writeCoord(oid, did, gpsReadingToDriverCoord(reading));
      },
      {
        timeIntervalMs: 2000,
        distanceIntervalM: 5,
      },
    );
  } catch (e) {
    logLocationDebug('[DRIVER LIVE SHARE] watch failed', {
      orderId: oid,
      error: e instanceof Error ? e.message : String(e),
    });
    await stopDriverLiveSharing('permission_denied');
    return false;
  }

  logLocationDebug('[DRIVER LIVE SHARE] started', { orderId: oid, driverId: did });
  return true;
}

/** Stop publishing and clear session artifacts for privacy. */
export async function stopDriverLiveSharing(
  reason: DriverLiveSharingStopReason = 'manual',
): Promise<void> {
  const prev = session;
  watchSub?.remove();
  watchSub = null;

  if (prev) {
    resetDriverLocationThrottle(prev.orderId, prev.driverId);
    logLocationDebug('[DRIVER LIVE SHARE] stopped', {
      orderId: prev.orderId,
      reason,
    });
    if (
      reason === 'delivered' ||
      reason === 'cancelled' ||
      reason === 'unassigned' ||
      reason === 'logout' ||
      reason === 'declined'
    ) {
      await writeEnabledOrderId(null);
    }
    if (
      reason === 'delivered' ||
      reason === 'cancelled' ||
      reason === 'unassigned' ||
      reason === 'logout'
    ) {
      await clearLiveSharingArtifacts(prev.orderId, prev.driverId);
    }
  } else if (
    reason === 'declined' ||
    reason === 'unassigned' ||
    reason === 'delivered' ||
    reason === 'cancelled' ||
    reason === 'logout'
  ) {
    await writeEnabledOrderId(null);
  }

  setSession(null);
}

/**
 * Resume sharing only when the driver previously enabled live location for this order
 * and OS permission is already granted. Does not prompt.
 */
export async function ensureDriverLiveSharing(
  orderId: string,
  driverId: string,
): Promise<boolean> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return false;
  if (isDriverLiveSharingActive(oid, did)) return true;

  const enabledId = await readEnabledOrderId();
  if (enabledId !== oid) return false;

  const permission = await getForegroundPermissionStatus();
  if (permission !== 'granted') return false;
  return startDriverLiveSharing(oid, did);
}

export async function getEnabledDriverLiveShareOrderId(): Promise<string | null> {
  return readEnabledOrderId();
}
