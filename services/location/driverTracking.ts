import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getDistance } from 'geolib';

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

/**
 * Throttled live driver GPS sync:
 * - orders/{orderId}.driverLocation
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
  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', oid), { driverLocation: payload });
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
  return true;
}
