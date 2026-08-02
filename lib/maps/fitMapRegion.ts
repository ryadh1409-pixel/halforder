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
};

/** Auto-fit map viewport to all known markers. */
export function fitMapToCoordinates(
  mapRef: FitMapRef | null | undefined,
  coordinates: GeoCoordinate[],
  edgePadding: MapEdgePadding = DEFAULT_MAP_EDGE_PADDING,
): FitMapRuntimeResult {
  const coords = coordinates.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));
  const methodExists = typeof mapRef?.fitToCoordinates === 'function';
  const result: FitMapRuntimeResult = {
    called: false,
    methodExists,
    coordinateCount: coords.length,
    coordinates: coords,
    edgePadding,
    error: null,
  };

  console.log('[MAP RUNTIME] fitToCoordinates() called', {
    mapRefNull: mapRef == null,
    methodExists,
    coordinateCount: coords.length,
    coordinates: coords,
    edgePadding,
    hasAnimateCamera: typeof mapRef?.animateCamera === 'function',
    hasAnimateToRegion: typeof mapRef?.animateToRegion === 'function',
  });

  if (!mapRef?.fitToCoordinates || coords.length < 1) {
    console.warn('[MAP RUNTIME] fitToCoordinates() SKIPPED', {
      reason: !mapRef
        ? 'mapRef_null'
        : !methodExists
          ? 'method_missing'
          : 'no_coordinates',
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
