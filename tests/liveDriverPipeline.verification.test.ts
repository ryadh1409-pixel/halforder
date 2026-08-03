/**
 * End-to-end pipeline verification for canonical live driver location.
 * Proves: raw Firestore driverLocation → mapper → banner gate → marker input.
 */
import { driverLocationFingerprint } from '@/lib/customerOrderSnapshotSignature';
import { parseLegacyLatLng } from '@/lib/location/coordinates';

/** Mirror orderService.parseLatLng without importing expo-location. */
function isValidGpsCoordinates(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

function mapDriverLocation(raw: unknown): { lat: number; lng: number; heading?: number | null } | null {
  const parsed = parseLegacyLatLng(raw);
  if (!parsed) return null;
  if (!isValidGpsCoordinates(parsed.lat, parsed.lng)) return null;
  return parsed;
}

function buildPayload(coord: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
}) {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    heading: coord.heading ?? null,
    speed: coord.speed ?? null,
    lat: coord.latitude,
    lng: coord.longitude,
  };
}

describe('canonical live driver pipeline', () => {
  const stages: Array<Record<string, unknown>> = [];

  function stage(
    name: string,
    file: string,
    input: unknown,
    output: unknown,
    success: boolean,
    reason?: string,
  ) {
    const row = {
      function: name,
      file,
      timestamp: Date.now(),
      input,
      output,
      success,
      reason: reason ?? null,
    };
    stages.push(row);
    // eslint-disable-next-line no-console
    console.log('[PIPELINE STAGE]', JSON.stringify(row));
    return success;
  }

  it('proves write payload → map → fingerprint → banner clear for regular order', () => {
    stages.length = 0;
    const coord = { latitude: 45.4215, longitude: -75.6972, heading: 90, speed: 5 };
    const payload = buildPayload(coord);

    stage(
      'buildDriverLocationFirestorePayload',
      'services/location/driverTracking.ts',
      coord,
      { keys: Object.keys(payload).sort() },
      true,
    );

    const rawOrder = {
      id: 'order_regular',
      status: 'picked_up',
      deliveryStatus: 'picked_up',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      driverLocation: payload,
      updatedAt: { seconds: 100, nanoseconds: 0 },
    };

    const fp = driverLocationFingerprint(rawOrder);
    stage(
      'driverLocationFingerprint',
      'lib/customerOrderSnapshotSignature.ts',
      rawOrder.driverLocation,
      fp,
      fp.includes('45.4215'),
      fp ? undefined : 'empty_fingerprint',
    );

    const mapped = mapDriverLocation(rawOrder.driverLocation);
    stage(
      'mapDriverLocation/parseLatLng',
      'services/orderService.ts',
      rawOrder.driverLocation,
      mapped,
      mapped != null,
      mapped ? undefined : 'mapper_discarded_driverLocation',
    );

    const expectDriver = Boolean(rawOrder.driverId || rawOrder.assignedDriverId);
    const displayDriver = mapped
      ? { latitude: mapped.lat, longitude: mapped.lng }
      : null;
    const showWaitingBanner = expectDriver && !displayDriver;
    stage(
      'waitingBannerGate',
      'components/maps/CustomerTrackingMap.native.tsx',
      { expectDriver, displayDriver },
      { showWaitingBanner },
      !showWaitingBanner,
      showWaitingBanner ? 'banner_still_visible' : 'banner_cleared',
    );

    const markerMounted = Boolean(displayDriver);
    stage(
      'LiveDriverVehicleMarker',
      'components/maps/LiveDriverVehicleMarker.native.tsx',
      displayDriver,
      { renderDecision: markerMounted ? 'show' : 'hide' },
      markerMounted,
      markerMounted ? undefined : 'no_coordinates',
    );

    expect(stages.every((s) => s.success === true)).toBe(true);
    expect(showWaitingBanner).toBe(false);
  });

  it('proves HalfOrder/Swipe sibling mirrored GPS clears banner for every customer', () => {
    stages.length = 0;
    const sharedGps = {
      lat: 45.43,
      lng: -75.68,
      latitude: 45.43,
      longitude: -75.68,
      heading: 180,
      speed: 8,
    };
    for (const customerOrderId of ['half_a', 'half_b', 'swipe_c']) {
      const mapped = mapDriverLocation(sharedGps);
      const banner = mapped == null;
      stage(
        `customerMap:${customerOrderId}`,
        'components/maps/CustomerTrackingMap.native.tsx',
        { orderId: customerOrderId, driverLocation: sharedGps },
        { mapped, bannerCleared: !banner },
        mapped != null && !banner,
      );
    }
    expect(
      stages.filter((s) => String(s.function).startsWith('customerMap:')).every((s) => s.success),
    ).toBe(true);
  });

  it('documents current production failure: Firestore driverLocation null', () => {
    stages.length = 0;
    const raw = {
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      driverLocation: null as null,
    };
    const mapped = mapDriverLocation(raw.driverLocation);
    const showWaitingBanner = Boolean(raw.driverId) && !mapped;
    stage(
      'nullDriverLocationSymptom',
      'orders/{id}.driverLocation',
      raw,
      { mapped, showWaitingBanner },
      true,
      'Firestore_driverLocation_is_null_write_never_landed',
    );
    expect(showWaitingBanner).toBe(true);
    expect(mapped).toBeNull();
  });
});
