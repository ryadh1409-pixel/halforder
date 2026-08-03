import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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

/**
 * Dual-write canonical + legacy lat/lng for backward-compatible readers.
 * Keys must stay within firestore.rules `driverLocationMapOk` hasOnly list
 * (no `accuracy` — not allowed by rules).
 */
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

function logPublish(stage: string, payload: Record<string, unknown>): void {
  console.log(stage, payload);
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
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: true,
    });
  } catch (e) {
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/**
 * Canonical write — MUST match firestore ultra-light path:
 *   affectedKeys().hasOnly(['driverLocation'])
 *   && auth.uid == driverId | assignedDriverId
 *
 * Writing `{ driverLocation, updatedAt }` together FAILS that path and then
 * falls through to isValidDriverLocationOnlyPatch which requires
 * deliveryType == 'delivery'. Orders without that field (common on food-share /
 * half-order / some marketplace docs) silently never receive GPS — while the
 * local driver session + route keep working. That is the customer waiting bug.
 */
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

  logPublish('[DRIVER LOCATION PUBLISH]', {
    orderId,
    documentPath: path,
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading: coord.heading ?? null,
    speed: coord.speed ?? null,
    timestamp: Date.now(),
  });

  try {
    // Ultra-light: ONLY driverLocation (no root updatedAt).
    await updateDoc(doc(db, 'orders', orderId), {
      driverLocation: payload,
    });
    logPublish('[ORDER DRIVER LOCATION WRITE]', {
      documentPath: path,
      orderId,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: true,
      mode: 'ultra_light_driverLocation_only',
    });
  } catch (e) {
    logPublish('[ORDER DRIVER LOCATION WRITE]', {
      documentPath: path,
      orderId,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: false,
      mode: 'ultra_light_driverLocation_only',
      error: e instanceof Error ? e.message : String(e),
      file: 'services/location/driverTracking.ts',
      function: 'writeCanonicalOrderDriverLocation',
    });
    throw e;
  }

  // Best-effort freshness bump — never required for GPS delivery (fingerprint path).
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* ignore — GPS already landed on canonical field */
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
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: true,
    });
  } catch (e) {
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: false,
      error: e instanceof Error ? e.message : String(e),
      note: 'companion_only_canonical_already_written',
    });
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
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: true,
    });
  } catch (e) {
    logPublish('[DRIVER FIRESTORE WRITE]', {
      documentPath: path,
      latitude: coord.latitude,
      longitude: coord.longitude,
      heading: coord.heading ?? null,
      timestamp: Date.now(),
      success: false,
      error: e instanceof Error ? e.message : String(e),
      note: 'companion_only_canonical_already_written',
    });
  }
}

/**
 * Throttled live driver GPS sync.
 *
 * Canonical source of truth (customers + all tracking screens):
 *   orders/{orderId}.driverLocation
 *
 * Architecture:
 * 1. Write canonical order field alone (ultra-light rules-compatible).
 * 2. Mirror to sibling group orders (HalfOrder / Swipe / group) — same payload.
 * 3. Best-effort companions (live_locations, drivers) — never block #1.
 */
export async function syncDriverLiveLocation(
  orderId: string,
  driverId: string,
  coord: DriverLiveCoordinate,
  options?: { force?: boolean; mirrorOrderIds?: string[] },
): Promise<boolean> {
  const oid = orderId.trim();
  const did = driverId.trim();
  if (!oid || !did) return false;

  const key = `${did}:${oid}`;
  if (!options?.force && !shouldWriteDriverLocation(key, coord)) {
    return false;
  }

  const payload = buildDriverLocationFirestorePayload(coord);
  const mirrors = (options?.mirrorOrderIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id && id !== oid);

  // 1) Canonical — must succeed for customers to track.
  await writeCanonicalOrderDriverLocation(oid, coord, payload);

  // 2) Shared-delivery mirrors — same GPS, every customer order doc.
  await Promise.all(
    mirrors.map((mirrorId) =>
      writeCanonicalOrderDriverLocation(mirrorId, coord, payload).catch((e) => {
        logPublish('[ORDER DRIVER LOCATION WRITE]', {
          documentPath: `orders/${mirrorId}`,
          latitude: coord.latitude,
          longitude: coord.longitude,
          heading: coord.heading ?? null,
          timestamp: Date.now(),
          success: false,
          error: e instanceof Error ? e.message : String(e),
          note: 'mirror_failed_primary_ok',
        });
      }),
    ),
  );

  // 3) Companions — never block canonical.
  await Promise.all([
    writeCompanionLiveLocation(oid, did, coord, payload),
    writeCompanionDriverProfile(did, coord, payload),
  ]);

  return true;
}
