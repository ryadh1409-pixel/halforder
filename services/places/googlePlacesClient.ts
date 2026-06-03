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

  const res = await fetch(url);
  if (!res.ok) {
    throw new PlacesApiError(`Places search failed (${res.status}).`, 'HTTP_ERROR');
  }

  const data = (await res.json()) as AutocompleteResponse;
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
  const res = await fetch(url);
  if (!res.ok) {
    throw new PlacesApiError(`Place details failed (${res.status}).`, 'HTTP_ERROR');
  }

  const data = (await res.json()) as PlaceDetailsResponse;
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
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ok: false,
        status: 'HTTP_ERROR',
        message: `Reverse geocoding failed (${res.status}).`,
      };
    }

    const data = (await res.json()) as GeocodeResponse;

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

  const res = await fetch(url);
  if (!res.ok) {
    throw new PlacesApiError(`Geocoding failed (${res.status}).`, 'HTTP_ERROR');
  }

  const data = (await res.json()) as GeocodeResponse;

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
