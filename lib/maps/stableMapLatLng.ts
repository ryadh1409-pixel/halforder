/**
 * Stable map LatLng helpers — avoid new object identity every render.
 * Presentation / hook-input hygiene only.
 */
export type MapLatLngLiteral = { latitude: number; longitude: number };

export function stableMapLatLng(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): MapLatLngLiteral | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  if (Math.abs(latitude) < 0.001 && Math.abs(longitude) < 0.001) return null;
  return { latitude, longitude };
}

/** Round GPS for cheap equality / React dependency keys. */
export function roundCoordKey(lat: number, lng: number, decimals = 5): string {
  const f = 10 ** decimals;
  return `${Math.round(lat * f) / f},${Math.round(lng * f) / f}`;
}
