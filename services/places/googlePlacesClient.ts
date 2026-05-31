import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';
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

type PlaceDetailsResponse = {
  status: string;
  result?: {
    place_id: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  };
  error_message?: string;
};

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

function mapAutocompleteStatus(status: string, errorMessage?: string): never {
  if (status === 'ZERO_RESULTS') {
    throw new PlacesApiError('No addresses found. Try a different search.', status);
  }
  if (status === 'OVER_QUERY_LIMIT') {
    throw new PlacesApiError('Places search is temporarily unavailable. Try again later.', status);
  }
  if (status === 'REQUEST_DENIED') {
    throw new PlacesApiError(
      errorMessage ??
        'Places API access denied. Enable Places API and check your API key restrictions.',
      status,
    );
  }
  throw new PlacesApiError(
    errorMessage ?? 'Could not search addresses. Please try again.',
    status,
  );
}

/**
 * Google Places Autocomplete (legacy REST). Returns address suggestions for profile picker.
 */
export async function fetchPlaceAutocompleteSuggestions(
  input: string,
  options?: { origin?: { latitude: number; longitude: number } },
): Promise<PlaceAutocompleteSuggestion[]> {
  const query = input.trim();
  if (query.length < 2) return [];

  const key = requireApiKey();
  const params = new URLSearchParams({
    input: query,
    key,
    types: 'address',
  });
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
  if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
    return (data.predictions ?? []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? '',
    }));
  }
  mapAutocompleteStatus(data.status, data.error_message);
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
    fields: 'place_id,formatted_address,geometry',
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new PlacesApiError(`Place details failed (${res.status}).`, 'HTTP_ERROR');
  }

  const data = (await res.json()) as PlaceDetailsResponse;
  if (data.status !== 'OK' || !data.result?.geometry?.location) {
    mapAutocompleteStatus(data.status, data.error_message);
  }

  const result = data.result!;
  const lat = result.geometry!.location!.lat;
  const lng = result.geometry!.location!.lng;
  const address = result.formatted_address?.trim() ?? '';
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new PlacesApiError('Selected place has no usable address.', 'INVALID_RESULT');
  }

  return {
    placeId: result.place_id,
    address,
    latitude: lat,
    longitude: lng,
  };
}

/** Geocode free-text address when user picks a custom label without Places id. */
export async function geocodeAddressToCoordinates(
  address: string,
): Promise<PlaceDetailsResult> {
  const query = address.trim();
  if (!query) {
    throw new PlacesApiError('Enter an address to search.', 'INVALID_INPUT');
  }

  const key = requireApiKey();
  const params = new URLSearchParams({ address: query, key });
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new PlacesApiError(`Geocoding failed (${res.status}).`, 'HTTP_ERROR');
  }

  const data = (await res.json()) as {
    status: string;
    results?: {
      place_id?: string;
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
    }[];
    error_message?: string;
  };

  if (data.status !== 'OK' || !data.results?.length) {
    mapAutocompleteStatus(data.status, data.error_message);
  }

  const first = data.results![0];
  const lat = first.geometry?.location?.lat;
  const lng = first.geometry?.location?.lng;
  const formatted = first.formatted_address?.trim() ?? query;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new PlacesApiError('Could not geocode that address.', 'INVALID_RESULT');
  }

  return {
    placeId: first.place_id ?? '',
    address: formatted,
    latitude: lat,
    longitude: lng,
  };
}
