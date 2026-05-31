/**
 * Google Maps Platform API architecture (Phase 4).
 * Wire server-side keys via Cloud Functions — never expose secrets in the client bundle.
 */

export type LatLngLiteral = { latitude: number; longitude: number };

export type PlacesAutocompleteRequest = {
  input: string;
  sessionToken?: string;
  origin?: LatLngLiteral;
  radiusMeters?: number;
};

export type PlaceDetailsRequest = {
  placeId: string;
  sessionToken?: string;
};

export type DirectionsRequest = {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  waypoints?: LatLngLiteral[];
  mode?: 'driving' | 'walking' | 'bicycling';
};

export type DistanceMatrixRequest = {
  origins: LatLngLiteral[];
  destinations: LatLngLiteral[];
  mode?: 'driving' | 'walking' | 'bicycling';
};

export type EtaEstimate = {
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds?: number;
};

/** Placeholder — implement via Cloud Function proxy. */
export async function placesAutocomplete(
  _request: PlacesAutocompleteRequest,
): Promise<{ placeId: string; description: string }[]> {
  throw new Error('Places API not configured. Deploy maps proxy Cloud Function.');
}

/** Placeholder — implement via Cloud Function proxy. */
export async function getPlaceDetails(
  _request: PlaceDetailsRequest,
): Promise<{ latitude: number; longitude: number; formattedAddress: string }> {
  throw new Error('Places API not configured. Deploy maps proxy Cloud Function.');
}

/** Placeholder — Directions API (Phase 4+). Do not call from production UI yet. */
export async function fetchDirections(_request: DirectionsRequest): Promise<{
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
}> {
  throw new Error('Directions API not configured. Deploy maps proxy Cloud Function.');
}

/** Placeholder — Distance Matrix for ETA batching. */
export async function fetchDistanceMatrix(
  _request: DistanceMatrixRequest,
): Promise<EtaEstimate[][]> {
  throw new Error('Distance Matrix API not configured. Deploy maps proxy Cloud Function.');
}

/** Client-side ETA fallback until Directions/Matrix is wired. */
export function estimateEtaFromDistanceKm(distanceKm: number, avgSpeedKmh = 28): EtaEstimate {
  const distanceMeters = Math.max(0, distanceKm * 1000);
  const durationSeconds = Math.round((distanceKm / avgSpeedKmh) * 3600);
  return { distanceMeters, durationSeconds };
}
