import { doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getDistance } from 'geolib';

import { traceOrderWriteFromPatch } from '@/lib/orderWriteTrace';
import type { DriverLocationRecord, DriverLiveCoordinate } from '@/types/location';
import { db } from '@/services/firebase';

/** Minimum seconds between Firestore driver location writes. */
export const DRIVER_LOCATION_WRITE_INTERVAL_MS = 5000;

/** Minimum meters moved before writing again (unless interval elapsed). */
export const DRIVER_LOCATION_MIN_DISTANCE_M = 15;

export function buildDriverLocationRecord(coord: DriverLiveCoordinate): DriverLocationRecord {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading:
      typeof coord.heading === 'number' && Number.isFinite(coord.heading)
        ? coord.heading
        : null,
    speed: typeof coord.speed === 'number' && Number.isFinite(coord.speed) ? coord.speed : null,
    timestamp: serverTimestamp(),
  };
}

/** Dual-write canonical + legacy lat/lng for backward-compatible readers. */
export function buildDriverLocationFirestorePayload(coord: DriverLiveCoordinate): Record<string, unknown> {
  const canonical = buildDriverLocationRecord(coord);
  return {
    ...canonical,
    lat: coord.latitude,
    lng: coord.longitude,
    updatedAt: serverTimestamp(),
  };
}

type ThrottleState = {
  lastWriteMs: number;
  lastLat: number;
  lastLng: number;
};

const throttleByKey = new Map<string, ThrottleState>();

function shouldWriteDriverLocation(key: string, coord: DriverLiveCoordinate): boolean {
  const now = Date.now();
  const prev = throttleByKey.get(key);
  if (!prev) {
    throttleByKey.set(key, { lastWriteMs: now, lastLat: coord.latitude, lastLng: coord.longitude });
    return true;
  }

  const elapsed = now - prev.lastWriteMs;
  if (elapsed >= DRIVER_LOCATION_WRITE_INTERVAL_MS) {
    throttleByKey.set(key, { lastWriteMs: now, lastLat: coord.latitude, lastLng: coord.longitude });
    return true;
  }

  const movedM = getDistance(
    { latitude: prev.lastLat, longitude: prev.lastLng },
    { latitude: coord.latitude, longitude: coord.longitude },
  );
  if (movedM >= DRIVER_LOCATION_MIN_DISTANCE_M) {
    throttleByKey.set(key, { lastWriteMs: now, lastLat: coord.latitude, lastLng: coord.longitude });
    return true;
  }

  return false;
}

export function resetDriverLocationThrottle(orderId: string, driverId: string): void {
  throttleByKey.delete(`${driverId}:${orderId}`);
}

function logDriverFirestoreWrite(
  path: string,
  coord: DriverLiveCoordinate,
  ok: boolean,
  error?: unknown,
): void {
  // Temporary pipeline trace — keep until live vehicle is verified in the field.
  console.log('[DRIVER FIRESTORE WRITE]', {
    documentPath: path,
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading: coord.heading ?? null,
    timestamp: Date.now(),
    success: ok,
    error: ok
      ? null
      : error instanceof Error
        ? error.message
        : error != null
          ? String(error)
          : null,
  });
}

/** Profile / dispatch base — updates `drivers/{driverId}` live coordinates (no order). */
export async function syncDriverProfileBaseLocation(
  driverId: string,
  coord: DriverLiveCoordinate,
): Promise<void> {
  const did = driverId.trim();
  if (!did) return;

  const payload = buildDriverLocationFirestorePayload(coord);
  const path = `drivers/${did}`;
  try {
    await setDoc(
      doc(db, 'drivers', did),
      {
        liveLocation: payload,
        latitude: coord.latitude,
        longitude: coord.longitude,
        lat: coord.latitude,
        lng: coord.longitude,
        lastLocationUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    logDriverFirestoreWrite(path, coord, true);
  } catch (e) {
    logDriverFirestoreWrite(path, coord, false, e);
    throw e;
  }
}

async function writeCanonicalOrderDriverLocation(
  orderId: string,
  coord: DriverLiveCoordinate,
  payload: Record<string, unknown>,
): Promise<void> {
  const path = `orders/${orderId}`;
  traceOrderWriteFromPatch(
    'driverTracking.ts',
    'syncDriverLiveLocation',
    orderId,
    { driverLocation: payload },
    { op: 'update' },
  );
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      driverLocation: payload,
      updatedAt: serverTimestamp(),
    });
    logDriverFirestoreWrite(path, coord, true);
  } catch (e) {
    logDriverFirestoreWrite(path, coord, false, e);
    throw e;
  }
}

async function writeCompanionLiveLocation(
  orderId: string,
  driverId: string,
  coord: DriverLiveCoordinate,
  payload: Record<string, unknown>,
): Promise<void> {
  const path = `live_locations/${orderId}`;
  try {
    await setDoc(
      doc(db, 'live_locations', orderId),
      {
        orderId,
        driverId,
        ...payload,
      },
      { merge: true },
    );
    logDriverFirestoreWrite(path, coord, true);
  } catch (e) {
    // Companion only — never block the canonical orders/{id}.driverLocation write.
    logDriverFirestoreWrite(path, coord, false, e);
  }
}

async function writeCompanionDriverProfile(
  driverId: string,
  coord: DriverLiveCoordinate,
  payload: Record<string, unknown>,
): Promise<void> {
  const path = `drivers/${driverId}`;
  try {
    await setDoc(
      doc(db, 'drivers', driverId),
      {
        liveLocation: payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    logDriverFirestoreWrite(path, coord, true);
  } catch (e) {
    logDriverFirestoreWrite(path, coord, false, e);
  }
}

/**
 * Throttled live driver GPS sync.
 * Canonical source of truth for every tracking screen:
 *   orders/{orderId}.driverLocation
 *
 * Companions (best-effort, must not fail the canonical write):
 * - live_locations/{orderId}
 * - drivers/{driverId}.liveLocation
 */
export async function syncDriverLiveLocation(
  orderId: string,
  driverId: string,
  coord: DriverLiveCoordinate,
  options?: { force?: boolean },
): Promise<boolean> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return false;

  const key = `${did}:${oid}`;
  if (!options?.force && !shouldWriteDriverLocation(key, coord)) {
    return false;
  }

  const payload = buildDriverLocationFirestorePayload(coord);

  // Prefer a single batch when rules allow all three; fall back to canonical-first.
  try {
    const batch = writeBatch(db);
    traceOrderWriteFromPatch(
      'driverTracking.ts',
      'syncDriverLiveLocation',
      oid,
      { driverLocation: payload },
      { op: 'batch-update' },
    );
    batch.update(doc(db, 'orders', oid), {
      driverLocation: payload,
      updatedAt: serverTimestamp(),
    });
    batch.set(
      doc(db, 'live_locations', oid),
      {
        orderId: oid,
        driverId: did,
        ...payload,
      },
      { merge: true },
    );
    batch.set(
      doc(db, 'drivers', did),
      {
        liveLocation: payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();
    logDriverFirestoreWrite(`orders/${oid}`, coord, true);
    logDriverFirestoreWrite(`live_locations/${oid}`, coord, true);
    logDriverFirestoreWrite(`drivers/${did}`, coord, true);
    return true;
  } catch (batchError) {
    logDriverFirestoreWrite(`orders/${oid}+companions(batch)`, coord, false, batchError);
    // Root-cause fix: companion docs (esp. live_locations rules) must not prevent
    // customers from receiving orders/{id}.driverLocation.
    await writeCanonicalOrderDriverLocation(oid, coord, payload);
    await Promise.all([
      writeCompanionLiveLocation(oid, did, coord, payload),
      writeCompanionDriverProfile(did, coord, payload),
    ]);
    return true;
  }
}
