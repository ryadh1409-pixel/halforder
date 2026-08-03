/**
 * Foreground live GPS sharing for one active driver delivery.
 * Publishes real GPS only — no simulated movement.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

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
import { shouldBlockSimulatorGps } from '@/lib/location/physicalDeviceGps';
import * as Location from 'expo-location';

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
  /** Same-group sibling order ids — one GPS stream mirrored for every customer. */
  mirrorOrderIds: string[];
  current: DriverLiveCoordinate | null;
  permissionGranted: boolean;
  running: boolean;
};

let watchSub: { remove: () => void } | null = null;
let seedRetryTimer: ReturnType<typeof setInterval> | null = null;
let session: SessionState | null = null;
const listeners = new Set<Listener>();

function clearSeedRetryTimer(): void {
  if (seedRetryTimer) {
    clearInterval(seedRetryTimer);
    seedRetryTimer = null;
  }
}

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

/**
 * HalfOrder / Swipe / group batches use multiple order docs with one groupId.
 * Both customers subscribe to their own order — mirror the same live GPS onto
 * each assigned sibling so there is still exactly one GPS publisher.
 */
async function resolveGroupMirrorOrderIds(
  orderId: string,
  driverId: string,
): Promise<string[]> {
  try {
    const primarySnap = await getDoc(doc(db, 'orders', orderId));
    if (!primarySnap.exists()) return [];
    const data = primarySnap.data() as Record<string, unknown>;
    const groupId = typeof data.groupId === 'string' ? data.groupId.trim() : '';
    if (!groupId) return [];

    const snap = await getDocs(
      query(collection(db, 'orders'), where('groupId', '==', groupId)),
    );
    const mirrors: string[] = [];
    for (const d of snap.docs) {
      if (d.id === orderId) continue;
      const row = d.data() as Record<string, unknown>;
      const assigned =
        (typeof row.driverId === 'string' && row.driverId.trim()) ||
        (typeof row.assignedDriverId === 'string' && row.assignedDriverId.trim()) ||
        '';
      if (assigned === driverId) mirrors.push(d.id);
    }
    return mirrors;
  } catch (e) {
    logLocationDebug('[DRIVER LIVE SHARE] mirror resolve failed', {
      orderId,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/** Best-effort privacy cleanup — stop exposing live GPS after the delivery ends. */
async function clearLiveSharingArtifacts(
  orderId: string,
  driverId: string,
  mirrorOrderIds: string[] = [],
): Promise<void> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return;

  const targets = [oid, ...mirrorOrderIds.map((id) => id.trim()).filter(Boolean)];
  for (const target of targets) {
    try {
      // Ultra-light only — must match firestore.rules hasOnly(['driverLocation']).
      // Bundling updatedAt fails the ultra-light path and left stale GPS after stop.
      await updateDoc(doc(db, 'orders', target), {
        driverLocation: deleteField(),
      });
      console.log('[ORDER DRIVER LOCATION WRITE]', {
        documentPath: `orders/${target}`,
        success: true,
        mode: 'ultra_light_deleteField',
        timestamp: Date.now(),
        file: 'services/location/driverLiveSharingSession.ts',
        function: 'clearLiveSharingArtifacts',
      });
    } catch (e) {
      console.log('[ORDER DRIVER LOCATION WRITE]', {
        documentPath: `orders/${target}`,
        success: false,
        mode: 'ultra_light_deleteField',
        error: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
        file: 'services/location/driverLiveSharingSession.ts',
        function: 'clearLiveSharingArtifacts',
      });
    }
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
  meta?: { accuracy?: number | null; capturedAtMs?: number | null },
): Promise<boolean> {
  if (!session?.running) return false;
  if (session.orderId !== orderId || session.driverId !== driverId) return false;
  const startedAt = Date.now();
  console.log('[DRIVER GPS]', {
    orderId,
    driverId,
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading: coord.heading ?? null,
    accuracy: meta?.accuracy ?? null,
    speed: coord.speed ?? null,
    timestamp: meta?.capturedAtMs ?? startedAt,
    mirrorOrderIds: session.mirrorOrderIds,
    file: 'services/location/driverLiveSharingSession.ts',
    function: 'writeCoord',
  });
  try {
    await syncDriverLiveLocation(orderId, driverId, coord, {
      force: true,
      mirrorOrderIds: session.mirrorOrderIds,
    });
    // Only retain local display coords after canonical Firestore write succeeds.
    session = { ...session, current: coord };
    emit();
    clearSeedRetryTimer();
    return true;
  } catch (e) {
    logLocationDebug('[DRIVER LIVE SHARE] write failed', {
      orderId,
      error: e instanceof Error ? e.message : String(e),
    });
    console.log('[ORDER DRIVER LOCATION WRITE]', {
      documentPath: `orders/${orderId}`,
      orderId,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      durationMs: Date.now() - startedAt,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      file: 'services/location/driverLiveSharingSession.ts',
      function: 'writeCoord',
    });
    return false;
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

  // Only short-circuit when we already have a published fix for this order.
  // A "running" session with null current (seed failed / watch silent) must retry.
  if (
    session?.running &&
    session.orderId === oid &&
    session.driverId === did &&
    session.current != null
  ) {
    console.log('[DRIVER LIVE SHARE] already_publishing', {
      orderId: oid,
      latitude: session.current.latitude,
      longitude: session.current.longitude,
      timestamp: Date.now(),
    });
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
      mirrorOrderIds: [],
      current: null,
      permissionGranted: false,
      running: false,
    });
    console.log('[DRIVER LIVE SHARE] permission denied', {
      orderId: oid,
      file: 'services/location/driverLiveSharingSession.ts',
      function: 'startDriverLiveSharing',
      timestamp: Date.now(),
    });
    return false;
  }

  const mirrorOrderIds = await resolveGroupMirrorOrderIds(oid, did);

  setSession({
    orderId: oid,
    driverId: did,
    mirrorOrderIds,
    current: null,
    permissionGranted: true,
    running: true,
  });
  await writeEnabledOrderId(oid);

  console.log('[DRIVER LIVE SHARE] started', {
    orderId: oid,
    driverId: did,
    mirrorOrderIds,
    timestamp: Date.now(),
    file: 'services/location/driverLiveSharingSession.ts',
    function: 'startDriverLiveSharing',
  });

  const publishReading = async (reading: GpsReading, source: string) => {
    if (!session?.running || session.orderId !== oid) return;
    console.log('[DRIVER GPS]', {
      orderId: oid,
      driverId: did,
      latitude: reading.latitude,
      longitude: reading.longitude,
      heading: reading.heading ?? null,
      accuracy: reading.accuracy ?? null,
      speed: reading.speed ?? null,
      timestamp: reading.capturedAtMs ?? Date.now(),
      source,
      file: 'services/location/driverLiveSharingSession.ts',
      function: 'publishReading',
    });
    await writeCoord(oid, did, gpsReadingToDriverCoord(reading), {
      accuracy: reading.accuracy,
      capturedAtMs: reading.capturedAtMs,
    });
  };

  const seed = await getCurrentGpsReadingSafe({ highAccuracy: true });
  if (seed) {
    await publishReading(seed, 'seed');
  } else {
    // Softer fallback — last-known — so live sharing can still publish when a
    // high-accuracy fresh fix is momentarily unavailable.
    let fallback: GpsReading | null = null;
    try {
      if (!shouldBlockSimulatorGps()) {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          fallback = {
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            accuracy: last.coords.accuracy ?? null,
            heading: last.coords.heading ?? null,
            speed: last.coords.speed ?? null,
            capturedAtMs:
              typeof last.timestamp === 'number' ? last.timestamp : Date.now(),
          };
        }
      }
    } catch {
      /* ignore */
    }
    if (fallback) {
      console.log('[DRIVER GPS]', {
        orderId: oid,
        note: 'seed_via_last_known',
        latitude: fallback.latitude,
        longitude: fallback.longitude,
        timestamp: Date.now(),
        file: 'services/location/driverLiveSharingSession.ts',
        function: 'startDriverLiveSharing',
      });
      await publishReading(fallback, 'seed_last_known');
    } else {
      console.log('[DRIVER GPS]', {
        orderId: oid,
        driverId: did,
        latitude: null,
        longitude: null,
        heading: null,
        accuracy: null,
        timestamp: Date.now(),
        note: 'seed_unavailable_waiting_for_watch',
        file: 'services/location/driverLiveSharingSession.ts',
        function: 'startDriverLiveSharing',
        success: false,
      });
    }
  }

  try {
    watchSub?.remove();
    watchSub = await watchGpsPosition(
      (reading: GpsReading) => {
        void publishReading(reading, 'watch');
      },
      {
        timeIntervalMs: 2000,
        distanceIntervalM: 5,
      },
    );
  } catch (e) {
    console.log('[DRIVER LIVE SHARE] watch failed', {
      orderId: oid,
      error: e instanceof Error ? e.message : String(e),
      file: 'services/location/driverLiveSharingSession.ts',
      function: 'startDriverLiveSharing',
      timestamp: Date.now(),
    });
    await stopDriverLiveSharing('permission_denied');
    return false;
  }

  // Heartbeat: keep seeding until the first canonical Firestore write succeeds.
  // Fixes silent failure when watchPositionAsync never fires (common on simulators).
  clearSeedRetryTimer();
  seedRetryTimer = setInterval(() => {
    if (!session?.running || session.orderId !== oid) {
      clearSeedRetryTimer();
      return;
    }
    if (session.current != null) {
      clearSeedRetryTimer();
      return;
    }
    void (async () => {
      const retry = await getCurrentGpsReadingSafe({ highAccuracy: true });
      if (retry) await publishReading(retry, 'seed_retry');
      else {
        console.log('[DRIVER GPS]', {
          orderId: oid,
          note: 'seed_retry_unavailable',
          timestamp: Date.now(),
          success: false,
          file: 'services/location/driverLiveSharingSession.ts',
          function: 'seedRetryTimer',
        });
      }
    })();
  }, 3000);

  return true;
}

/** Stop publishing and clear session artifacts for privacy. */
export async function stopDriverLiveSharing(
  reason: DriverLiveSharingStopReason = 'manual',
): Promise<void> {
  const prev = session;
  clearSeedRetryTimer();
  watchSub?.remove();
  watchSub = null;

  if (prev) {
    resetDriverLocationThrottle(prev.orderId, prev.driverId);
    logLocationDebug('[DRIVER LIVE SHARE] stopped', {
      orderId: prev.orderId,
      reason,
    });
    console.log('[DRIVER LIVE SHARE] stopped', {
      orderId: prev.orderId,
      reason,
      timestamp: Date.now(),
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
      await clearLiveSharingArtifacts(
        prev.orderId,
        prev.driverId,
        prev.mirrorOrderIds,
      );
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
