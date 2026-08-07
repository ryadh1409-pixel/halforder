import { pickSavedLocationFieldsFromComponents } from '@/lib/location/addressComponents';
import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';
import type { SavedLocation } from '@/types/savedLocation';
import type {
  PlaceAutocompleteSuggestion,
  PlaceDetailsResult,
} from '@/types/userLocation';

export class PlacesApiError extends Error {
  readonly status: string;

  constructor(message: string, status = 'UNKNOWN') {
    super(message);
    this.name = 'PlacesApiError';
    this.status = status;
  }
}

type AutocompleteResponse = {
  status: string;
  predictions?: {
    place_id: string;
    description: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }[];
  error_message?: string;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type PlaceDetailsResponse = {
  status: string;
  result?: {
    place_id: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: GoogleAddressComponent[];
  };
  error_message?: string;
};

type GeocodeResponse = {
  status: string;
  results?: {
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: GoogleAddressComponent[];
  }[];
  error_message?: string;
};

function placeDetailsToSavedLocation(
  placeId: string,
  address: string,
  lat: number,
  lng: number,
  addressComponents?: GoogleAddressComponent[],
): SavedLocation {
  return {
    address,
    latitude: lat,
    longitude: lng,
    placeId,
    ...pickSavedLocationFieldsFromComponents(addressComponents),
  };
}

function requireApiKey(): string {
  const key = resolveGoogleMapsApiKey();
  if (!key) {
    throw new PlacesApiError(
      'Google Maps API key is not configured. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.',
      'MISSING_KEY',
    );
  }
  return key;
}

/** Temporary TestFlight diagnostics — logs key metadata + Google responses without full key. */
function redactGoogleUrl(url: string, key: string): string {
  if (!key) return url;
  return url.split(key).join(`${key.slice(0, 10)}…(redacted)`);
}

function logGoogleRequest(endpoint: string, key: string, url: string): void {
  console.log('[GOOGLE_MAPS_DIAG] request', {
    endpoint,
    apiKeyPrefix: key.slice(0, 10),
    apiKeyLength: key.length,
    url: redactGoogleUrl(url, key),
  });
}

async function fetchGoogleJson<T extends { status?: string; error_message?: string }>(
  endpoint: string,
  key: string,
  url: string,
): Promise<{ httpStatus: number; data: T }> {
  logGoogleRequest(endpoint, key, url);
  const res = await fetch(url);
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    console.log('[GOOGLE_MAPS_DIAG] response', {
      endpoint,
      httpStatus: res.status,
      parseError: true,
      body: null,
    });
    throw new PlacesApiError(`Google request failed (${res.status}).`, 'HTTP_ERROR');
  }
  console.log('[GOOGLE_MAPS_DIAG] response', {
    endpoint,
    httpStatus: res.status,
    googleStatus: data.status ?? null,
    googleErrorMessage: data.error_message ?? null,
    body: data,
  });
  return { httpStatus: res.status, data };
}

export type SafeGeocodeResult =
  | {
      ok: true;
      address: string;
      placeId: string;
      latitude: number;
      longitude: number;
      city?: string;
      province?: string;
      country?: string;
      postalCode?: string;
    }
  | { ok: false; status: string; message: string };

function mapGeocodeStatus(status: string, errorMessage?: string): never {
  if (status === 'ZERO_RESULTS') {
    throw new PlacesApiError(
      'No address found for your location. Try searching manually.',
      status,
    );
  }
  if (status === 'OVER_QUERY_LIMIT') {
    throw new PlacesApiError('Geocoding is temporarily unavailable. Try again later.', status);
  }
  if (status === 'REQUEST_DENIED') {
    throw new PlacesApiError(
      errorMessage ??
        'Geocoding API access denied. Enable Geocoding API and check your API key restrictions.',
      status,
    );
  }
  throw new PlacesApiError(
    errorMessage ?? 'Could not resolve your address. Please try again.',
    status,
  );
}

/**
 * Google Places Autocomplete — live API results only, Canada-priority, biased to device GPS.
 */
export async function fetchPlaceAutocompleteSuggestions(
  input: string,
  options?: {
    origin?: { latitude: number; longitude: number };
    /** Include establishments + geocode (street, city, postal, restaurants). */
    broadTypes?: boolean;
  },
): Promise<PlaceAutocompleteSuggestion[]> {
  const query = input.trim();
  if (query.length < 2) return [];

  const key = requireApiKey();
  const params = new URLSearchParams({
    input: query,
    key,
    components: 'country:ca',
  });
  if (!options?.broadTypes) {
    params.set('types', 'geocode');
  }
  if (options?.origin) {
    params.set(
      'location',
      `${options.origin.latitude},${options.origin.longitude}`,
    );
    params.set('radius', '50000');
  }

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

  const { httpStatus, data } = await fetchGoogleJson<AutocompleteResponse>(
    'place/autocomplete',
    key,
    url,
  );
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new PlacesApiError(`Places search failed (${httpStatus}).`, 'HTTP_ERROR');
  }

  if (data.status === 'REQUEST_DENIED') {
    throw new PlacesApiError(
      'Location search unavailable. Please check API key.',
      'REQUEST_DENIED',
    );
  }
  if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
    return (data.predictions ?? []).map((p) => {
      const mainText = p.structured_formatting?.main_text ?? p.description;
      const secondaryText =
        p.structured_formatting?.secondary_text?.trim() || p.description;
      return {
        placeId: p.place_id,
        description: p.description,
        mainText,
        secondaryText,
        formattedAddress: p.description,
      };
    });
  }
  mapGeocodeStatus(data.status, data.error_message);
}

/** Resolve a place id into formatted address + coordinates (Place Details). */
export async function fetchPlaceDetails(
  placeId: string,
): Promise<PlaceDetailsResult> {
  const id = placeId.trim();
  if (!id) {
    throw new PlacesApiError('Invalid place selection.', 'INVALID_PLACE');
  }

  const key = requireApiKey();
  const params = new URLSearchParams({
    place_id: id,
    key,
    fields: 'place_id,formatted_address,geometry,address_components',
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const { httpStatus, data } = await fetchGoogleJson<PlaceDetailsResponse>(
    'place/details',
    key,
    url,
  );
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new PlacesApiError(`Place details failed (${httpStatus}).`, 'HTTP_ERROR');
  }

  if (data.status !== 'OK' || !data.result?.geometry?.location) {
    mapGeocodeStatus(data.status, data.error_message);
  }

  const result = data.result!;
  const lat = result.geometry!.location!.lat;
  const lng = result.geometry!.location!.lng;
  const address = result.formatted_address?.trim() ?? '';
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new PlacesApiError('Selected place has no usable address.', 'INVALID_RESULT');
  }

  const saved = placeDetailsToSavedLocation(
    result.place_id,
    address,
    lat,
    lng,
    result.address_components,
  );

  return {
    placeId: saved.placeId ?? result.place_id,
    address: saved.address,
    latitude: saved.latitude,
    longitude: saved.longitude,
    city: saved.city,
    province: saved.province,
    country: saved.country,
    postalCode: saved.postalCode,
  };
}

/** Full saved location from a Places place id. */
export async function fetchPlaceDetailsAsSavedLocation(
  placeId: string,
): Promise<SavedLocation> {
  const details = await fetchPlaceDetails(placeId);
  return {
    address: details.address,
    latitude: details.latitude,
    longitude: details.longitude,
    placeId: details.placeId,
    ...(details.city ? { city: details.city } : {}),
    ...(details.province ? { province: details.province } : {}),
    ...(details.country ? { country: details.country } : {}),
    ...(details.postalCode ? { postalCode: details.postalCode } : {}),
  };
}

/**
 * Reverse geocode GPS via Google Geocoding API.
 * https://maps.googleapis.com/maps/api/geocode/json?latlng=LAT,LNG&key=API_KEY
 */
/**
 * Reverse geocode without throwing — used when checkout/profile must keep GPS even if API fails.
 */
export async function reverseGeocodeCoordinatesSafe(
  latitude: number,
  longitude: number,
): Promise<SafeGeocodeResult> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      status: 'INVALID_INPUT',
      message: 'Invalid GPS coordinates.',
    };
  }

  let key: string;
  try {
    key = requireApiKey();
  } catch (e) {
    const msg = e instanceof PlacesApiError ? e.message : 'API key missing';
    return { ok: false, status: 'MISSING_KEY', message: msg };
  }

  const latlng = `${latitude},${longitude}`;
  const params = new URLSearchParams({ latlng, key });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  try {
    const { httpStatus, data } = await fetchGoogleJson<GeocodeResponse>(
      'geocode/reverse',
      key,
      url,
    );
    if (httpStatus < 200 || httpStatus >= 300) {
      return {
        ok: false,
        status: 'HTTP_ERROR',
        message: `Reverse geocoding failed (${httpStatus}).`,
      };
    }

    if (data.status !== 'OK' || !data.results?.length) {
      return {
        ok: false,
        status: data.status || 'UNKNOWN',
        message:
          data.error_message ??
          (data.status === 'REQUEST_DENIED'
            ? 'The provided API key is invalid or Geocoding API is not enabled.'
            : 'Could not resolve your address.'),
      };
    }

    const first = data.results[0]!;
    const formatted = first.formatted_address?.trim() ?? '';
    if (!formatted) {
      return {
        ok: false,
        status: 'INVALID_RESULT',
        message: 'Google returned no formatted address for your location.',
      };
    }

    const fields = pickSavedLocationFieldsFromComponents(first.address_components);

    return {
      ok: true,
      address: formatted,
      placeId: first.place_id ?? '',
      latitude,
      longitude,
      ...fields,
    };
  } catch (e) {
    return {
      ok: false,
      status: 'NETWORK_ERROR',
      message: e instanceof Error ? e.message : 'Network error during geocoding.',
    };
  }
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<PlaceDetailsResult> {
  const result = await reverseGeocodeCoordinatesSafe(latitude, longitude);
  if (!result.ok) {
    if (result.status === 'ZERO_RESULTS') {
      throw new PlacesApiError(
        'No address found for your location. Try searching manually.',
        result.status,
      );
    }
    if (result.status === 'REQUEST_DENIED') {
      throw new PlacesApiError(result.message, result.status);
    }
    throw new PlacesApiError(result.message, result.status);
  }
  return {
    placeId: result.placeId,
    address: result.address,
    latitude: result.latitude,
    longitude: result.longitude,
    city: result.city,
    province: result.province,
    country: result.country,
    postalCode: result.postalCode,
  };
}

/** Geocode free-text address — Canada region priority. */
export async function geocodeAddressToCoordinates(
  address: string,
): Promise<PlaceDetailsResult> {
  const query = address.trim();
  if (!query) {
    throw new PlacesApiError('Enter an address to search.', 'INVALID_INPUT');
  }

  const key = requireApiKey();
  const params = new URLSearchParams({
    address: query,
    key,
    region: 'ca',
    components: 'country:CA',
  });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  const { httpStatus, data } = await fetchGoogleJson<GeocodeResponse>(
    'geocode/forward',
    key,
    url,
  );
  if (httpStatus < 200 || httpStatus >= 300) {
    throw new PlacesApiError(`Geocoding failed (${httpStatus}).`, 'HTTP_ERROR');
  }

  if (data.status !== 'OK' || !data.results?.length) {
    mapGeocodeStatus(data.status, data.error_message);
  }

  const first = data.results![0];
  const lat = first.geometry?.location?.lat;
  const lng = first.geometry?.location?.lng;
  const formatted = first.formatted_address?.trim() ?? query;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new PlacesApiError('Could not geocode that address.', 'INVALID_RESULT');
  }

  const saved = placeDetailsToSavedLocation(
    first.place_id ?? '',
    formatted,
    lat,
    lng,
    first.address_components,
  );

  return {
    placeId: saved.placeId ?? '',
    address: saved.address,
    latitude: saved.latitude,
    longitude: saved.longitude,
    city: saved.city,
    province: saved.province,
    country: saved.country,
    postalCode: saved.postalCode,
  };
}

/** Geocode free text into a {@link SavedLocation}. */
export async function geocodeAddressToSavedLocation(
  address: string,
): Promise<SavedLocation> {
  const details = await geocodeAddressToCoordinates(address);
  return {
    address: details.address,
    latitude: details.latitude,
    longitude: details.longitude,
    ...(details.placeId ? { placeId: details.placeId } : {}),
    ...(details.city ? { city: details.city } : {}),
    ...(details.province ? { province: details.province } : {}),
    ...(details.country ? { country: details.country } : {}),
    ...(details.postalCode ? { postalCode: details.postalCode } : {}),
  };
}

// ── Nearby Search & Text Search — correct APIs for restaurant discovery ────

export type NearbyRestaurantResult = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  isOpen: boolean | null;
  photoReference: string | null;
  types: string[];
};

type NearbySearchApiResponse = {
  status: string;
  error_message?: string;
  results?: {
    place_id: string;
    name?: string;
    vicinity?: string;
    geometry?: { location?: { lat: number; lng: number } };
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    opening_hours?: { open_now?: boolean };
    photos?: { photo_reference: string }[];
    types?: string[];
  }[];
  next_page_token?: string;
};

function mapNearbyResults(
  results: NearbySearchApiResponse['results'],
): NearbyRestaurantResult[] {
  return (results ?? [])
    .filter((r) => {
      const lat = r.geometry?.location?.lat;
      const lng = r.geometry?.location?.lng;
      return r.place_id && r.name && Number.isFinite(lat) && Number.isFinite(lng);
    })
    .map((r) => ({
      placeId: r.place_id,
      name: (r.name ?? '').trim(),
      address: r.vicinity?.trim() || null,
      lat: r.geometry!.location!.lat,
      lng: r.geometry!.location!.lng,
      rating: typeof r.rating === 'number' ? r.rating : null,
      reviewCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      priceLevel: typeof r.price_level === 'number' ? r.price_level : null,
      isOpen: r.opening_hours?.open_now ?? null,
      photoReference: r.photos?.[0]?.photo_reference ?? null,
      types: r.types ?? [],
    }));
}

/**
 * Google Places Nearby Search — the correct API for "find restaurants near me".
 * Returns up to 20 results sorted by prominence (rating × review count × distance).
 * Unlike Autocomplete, this is designed specifically for location-based category searches.
 */
export async function fetchPlacesNearbySearch(
  coords: { latitude: number; longitude: number },
  radiusMeters: number,
  keyword: string,
): Promise<NearbyRestaurantResult[]> {
  let key: string;
  try {
    key = requireApiKey();
  } catch {
    console.warn('[EmoOrder][NearbySearch] No API key — cannot search.');
    return [];
  }

  const params = new URLSearchParams({
    location: `${coords.latitude},${coords.longitude}`,
    radius: String(Math.round(radiusMeters)),
    keyword: keyword.trim(),
    type: 'restaurant',
    key,
    language: 'en',
  });
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;

  console.log('[EmoOrder][NearbySearch] Request', {
    lat: coords.latitude.toFixed(5),
    lng: coords.longitude.toFixed(5),
    radiusM: radiusMeters,
    keyword,
    type: 'restaurant',
  });

  const { httpStatus, data } = await fetchGoogleJson<NearbySearchApiResponse>(
    'place/nearbysearch',
    key,
    url,
  );

  console.log('[EmoOrder][NearbySearch] Response', {
    httpStatus,
    googleStatus: data.status,
    errorMessage: data.error_message ?? null,
    resultCount: data.results?.length ?? 0,
  });

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('[EmoOrder][NearbySearch] API error:', data.status, data.error_message);
    return [];
  }

  return mapNearbyResults(data.results);
}

/**
 * Google Places Text Search — broader restaurant discovery by text query.
 * Used as fallback when Nearby Search returns too few results.
 */
export async function fetchPlacesTextSearch(
  query: string,
  coords: { latitude: number; longitude: number },
  radiusMeters: number,
): Promise<NearbyRestaurantResult[]> {
  let key: string;
  try {
    key = requireApiKey();
  } catch {
    console.warn('[EmoOrder][TextSearch] No API key — cannot search.');
    return [];
  }

  const params = new URLSearchParams({
    query: query.trim(),
    location: `${coords.latitude},${coords.longitude}`,
    radius: String(Math.round(radiusMeters)),
    type: 'restaurant',
    key,
    language: 'en',
  });
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

  console.log('[EmoOrder][TextSearch] Request', {
    query,
    lat: coords.latitude.toFixed(5),
    lng: coords.longitude.toFixed(5),
    radiusM: radiusMeters,
  });

  const { httpStatus, data } = await fetchGoogleJson<NearbySearchApiResponse>(
    'place/textsearch',
    key,
    url,
  );

  console.log('[EmoOrder][TextSearch] Response', {
    httpStatus,
    googleStatus: data.status,
    errorMessage: data.error_message ?? null,
    resultCount: data.results?.length ?? 0,
  });

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('[EmoOrder][TextSearch] API error:', data.status, data.error_message);
    return [];
  }

  return mapNearbyResults(data.results);
}
