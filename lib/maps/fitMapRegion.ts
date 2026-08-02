import type { GeoCoordinate } from '@/types/location';

export type MapEdgePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export const DEFAULT_MAP_EDGE_PADDING: MapEdgePadding = {
  top: 80,
  right: 40,
  bottom: 120,
  left: 40,
};

/**
 * Span below this (degrees) is treated as overlapping markers.
 * ~0.00015° ≈ 15–17m — avoids fitToCoordinates zooming into a single point.
 */
export const MAP_COORD_OVERLAP_EPSILON_DEG = 0.00015;

/** Street-context zoom when only one distinct location is available. */
export const DEFAULT_SINGLE_POINT_LAT_DELTA = 0.02;
export const DEFAULT_SINGLE_POINT_LNG_DELTA = 0.02;

type FitMapRef = {
  fitToCoordinates?: (
    coordinates: { latitude: number; longitude: number }[],
    options: { edgePadding: MapEdgePadding; animated?: boolean },
  ) => void;
  animateCamera?: (camera: unknown, opts?: { duration?: number }) => void;
  animateToRegion?: (region: unknown, duration?: number) => void;
};

export type FitMapRuntimeResult = {
  called: boolean;
  methodExists: boolean;
  coordinateCount: number;
  coordinates: { latitude: number; longitude: number }[];
  edgePadding: MapEdgePadding;
  error: string | null;
  /** True when camera used a default region because points overlapped. */
  usedDefaultRegion?: boolean;
};

function toLatLng(c: GeoCoordinate | { latitude: number; longitude: number }): {
  latitude: number;
  longitude: number;
} {
  return { latitude: c.latitude, longitude: c.longitude };
}

/** True when at least two coordinates are meaningfully separated. */
export function areMapCoordinatesDistinct(
  coordinates: Array<GeoCoordinate | { latitude: number; longitude: number }>,
  epsilonDeg: number = MAP_COORD_OVERLAP_EPSILON_DEG,
): boolean {
  if (coordinates.length < 2) return false;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const raw of coordinates) {
    const c = toLatLng(raw);
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLng) minLng = c.longitude;
    if (c.longitude > maxLng) maxLng = c.longitude;
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat)) return false;
  return maxLat - minLat > epsilonDeg || maxLng - minLng > epsilonDeg;
}

function defaultRegionForCoordinate(c: { latitude: number; longitude: number }) {
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    latitudeDelta: DEFAULT_SINGLE_POINT_LAT_DELTA,
    longitudeDelta: DEFAULT_SINGLE_POINT_LNG_DELTA,
  };
}

/** Auto-fit map viewport to all known markers. */
export function fitMapToCoordinates(
  mapRef: FitMapRef | null | undefined,
  coordinates: GeoCoordinate[],
  edgePadding: MapEdgePadding = DEFAULT_MAP_EDGE_PADDING,
): FitMapRuntimeResult {
  const coords = coordinates.map(toLatLng);
  const methodExists = typeof mapRef?.fitToCoordinates === 'function';
  const result: FitMapRuntimeResult = {
    called: false,
    methodExists,
    coordinateCount: coords.length,
    coordinates: coords,
    edgePadding,
    error: null,
    usedDefaultRegion: false,
  };

  console.log('[MAP RUNTIME] fitToCoordinates() called', {
    mapRefNull: mapRef == null,
    methodExists,
    coordinateCount: coords.length,
    coordinates: coords,
    edgePadding,
    distinct: areMapCoordinatesDistinct(coords),
    hasAnimateCamera: typeof mapRef?.animateCamera === 'function',
    hasAnimateToRegion: typeof mapRef?.animateToRegion === 'function',
  });

  if (!mapRef || coords.length < 1) {
    console.warn('[MAP RUNTIME] fitToCoordinates() SKIPPED', {
      reason: !mapRef ? 'mapRef_null' : 'no_coordinates',
    });
    return result;
  }

  // Overlapping / duplicate points → street-level default region (never fit).
  if (!areMapCoordinatesDistinct(coords)) {
    const center = coords[0];
    if (typeof mapRef.animateToRegion !== 'function') {
      console.warn('[MAP RUNTIME] fitToCoordinates() SKIPPED', {
        reason: 'overlapping_coords_no_animateToRegion',
      });
      return result;
    }
    try {
      mapRef.animateToRegion(defaultRegionForCoordinate(center), 500);
      result.called = true;
      result.usedDefaultRegion = true;
      console.log('[MAP RUNTIME] animateToRegion() used (overlapping coordinates)', {
        coordinate: center,
        latitudeDelta: DEFAULT_SINGLE_POINT_LAT_DELTA,
        longitudeDelta: DEFAULT_SINGLE_POINT_LNG_DELTA,
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.warn('[MAP RUNTIME] animateToRegion() threw', result.error);
    }
    return result;
  }

  if (!mapRef.fitToCoordinates) {
    console.warn('[MAP RUNTIME] fitToCoordinates() SKIPPED', {
      reason: 'method_missing',
    });
    return result;
  }

  try {
    mapRef.fitToCoordinates(coords, { edgePadding, animated: true });
    result.called = true;
    console.log('[MAP RUNTIME] fitToCoordinates() dispatched to native');
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.warn('[MAP RUNTIME] fitToCoordinates() threw', result.error);
  }
  return result;
}
