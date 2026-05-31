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
};

/** Auto-fit map viewport to all known markers. */
export function fitMapToCoordinates(
  mapRef: FitMapRef | null | undefined,
  coordinates: GeoCoordinate[],
  edgePadding: MapEdgePadding = DEFAULT_MAP_EDGE_PADDING,
): void {
  if (!mapRef?.fitToCoordinates || coordinates.length < 1) return;
  try {
    mapRef.fitToCoordinates(
      coordinates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      { edgePadding, animated: true },
    );
  } catch {
    /* map not ready */
  }
}
