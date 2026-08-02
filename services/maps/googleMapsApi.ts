/**
 * Google Maps Platform client helpers for live delivery tracking.
 * Uses the same EXPO_PUBLIC maps key already required by Places / Maps SDK.
 */
import { decodeGooglePolyline } from '@/lib/maps/decodeGooglePolyline';
import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';

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

export type DirectionsResult = {
  polyline: string;
  coordinates: LatLngLiteral[];
  distanceMeters: number;
  durationSeconds: number;
  /** Per-leg totals (origin→waypoint / waypoint→destination). */
  legs: Array<{ distanceMeters: number; durationSeconds: number }>;
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

type DirectionsApiResponse = {
  status: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{
      distance?: { value?: number };
      duration?: { value?: number };
      duration_in_traffic?: { value?: number };
    }>;
  }>;
};

function requireApiKey(): string {
  const key = resolveGoogleMapsApiKey();
  if (!key) {
    throw new Error(
      'Google Maps API key is not configured. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.',
    );
  }
  return key;
}

function fmt(point: LatLngLiteral): string {
  return `${point.latitude},${point.longitude}`;
}

/** Directions API — restaurant → driver → customer (or simpler two-point routes). */
export async function fetchDirections(
  request: DirectionsRequest,
): Promise<DirectionsResult> {
  const key = requireApiKey();
  const params = new URLSearchParams({
    origin: fmt(request.origin),
    destination: fmt(request.destination),
    mode: request.mode ?? 'driving',
    key,
  });
  if (request.waypoints?.length) {
    params.set(
      'waypoints',
      request.waypoints.map((w) => fmt(w)).join('|'),
    );
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Directions HTTP ${res.status}`);
  }
  const data = (await res.json()) as DirectionsApiResponse;
  if (data.status !== 'OK' || !data.routes?.[0]) {
    throw new Error(data.error_message || `Directions status ${data.status}`);
  }

  const route = data.routes[0];
  const encoded = route.overview_polyline?.points ?? '';
  const coordinates = decodeGooglePolyline(encoded);
  let distanceMeters = 0;
  let durationSeconds = 0;
  const legs: Array<{ distanceMeters: number; durationSeconds: number }> = [];
  for (const leg of route.legs ?? []) {
    const legDistance = leg.distance?.value ?? 0;
    const legDuration =
      leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0;
    distanceMeters += legDistance;
    durationSeconds += legDuration;
    legs.push({ distanceMeters: legDistance, durationSeconds: legDuration });
  }

  return {
    polyline: encoded,
    coordinates,
    distanceMeters,
    durationSeconds,
    legs,
  };
}

/** Distance Matrix for ETA batching. */
export async function fetchDistanceMatrix(
  request: DistanceMatrixRequest,
): Promise<EtaEstimate[][]> {
  const key = requireApiKey();
  const params = new URLSearchParams({
    origins: request.origins.map(fmt).join('|'),
    destinations: request.destinations.map(fmt).join('|'),
    mode: request.mode ?? 'driving',
    key,
  });
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Distance Matrix HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  };
  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Distance Matrix status ${data.status}`);
  }
  return (data.rows ?? []).map((row) =>
    (row.elements ?? []).map((el) => ({
      distanceMeters: el.distance?.value ?? 0,
      durationSeconds: el.duration?.value ?? 0,
      durationInTrafficSeconds: el.duration_in_traffic?.value,
    })),
  );
}

/** Client-side ETA fallback until Directions/Matrix responds. */
export function estimateEtaFromDistanceKm(
  distanceKm: number,
  avgSpeedKmh = 28,
): EtaEstimate {
  const distanceMeters = Math.max(0, distanceKm * 1000);
  const durationSeconds = Math.round((distanceKm / Math.max(avgSpeedKmh, 1)) * 3600);
  return { distanceMeters, durationSeconds };
}
