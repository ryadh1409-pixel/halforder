import { haversineDistanceKm } from '@/lib/haversine';
import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';
import { parseGoogleMapsLink } from '@/lib/maps/parseGoogleMapsLink';
import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetails,
  geocodeAddressToCoordinates,
} from '@/services/places/googlePlacesClient';
import type { IWantRestaurantDraft } from '@/types/iWant';

export type RestaurantSearchOrigin = {
  latitude: number;
  longitude: number;
};

type PlaceEnrichment = {
  name: string | null;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  placeType: string | null;
};

const PLACE_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  meal_takeaway: 'Takeaway',
  meal_delivery: 'Delivery',
  bakery: 'Bakery',
  bar: 'Bar',
  food: 'Food',
  night_club: 'Nightlife',
  supermarket: 'Grocery',
  store: 'Store',
};

const SEARCH_CACHE_TTL_MS = 90_000;
const searchCache = new Map<
  string,
  { at: number; rows: IWantRestaurantDraft[] }
>();
const inFlightSearches = new Map<string, Promise<IWantRestaurantDraft[]>>();

async function resolveShortMapsUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
}

function labelForPlaceTypes(types: string[] | undefined): string | null {
  if (!types?.length) return null;
  for (const t of types) {
    const label = PLACE_TYPE_LABELS[t];
    if (label) return label;
  }
  const first = types.find(
    (t) => t !== 'point_of_interest' && t !== 'establishment',
  );
  if (!first) return null;
  return first
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatRestaurantDistanceLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function cacheKey(query: string, origin?: RestaurantSearchOrigin | null): string {
  const o =
    origin &&
    Number.isFinite(origin.latitude) &&
    Number.isFinite(origin.longitude)
      ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}`
      : 'none';
  return `${query.trim().toLowerCase()}|${o}`;
}

/**
 * Place Details enrichment for restaurant cards (name, rating, types).
 * Additive to the shared location `fetchPlaceDetails` — does not change it.
 */
async function fetchRestaurantPlaceEnrichment(
  placeId: string,
): Promise<PlaceEnrichment> {
  const key = resolveGoogleMapsApiKey();
  if (!key) {
    const details = await fetchPlaceDetails(placeId);
    return {
      name: null,
      address: details.address,
      lat: details.latitude,
      lng: details.longitude,
      rating: null,
      placeType: null,
    };
  }

  const params = new URLSearchParams({
    place_id: placeId.trim(),
    key,
    fields: 'place_id,name,formatted_address,geometry,rating,types',
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    status?: string;
    result?: {
      name?: string;
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
      rating?: number;
      types?: string[];
    };
  };

  if (
    data.status !== 'OK' ||
    !data.result?.geometry?.location ||
    !Number.isFinite(data.result.geometry.location.lat) ||
    !Number.isFinite(data.result.geometry.location.lng)
  ) {
    const details = await fetchPlaceDetails(placeId);
    return {
      name: null,
      address: details.address,
      lat: details.latitude,
      lng: details.longitude,
      rating: null,
      placeType: null,
    };
  }

  const loc = data.result.geometry.location;
  return {
    name: data.result.name?.trim() || null,
    address: data.result.formatted_address?.trim() || '',
    lat: loc.lat,
    lng: loc.lng,
    rating:
      typeof data.result.rating === 'number' && Number.isFinite(data.result.rating)
        ? data.result.rating
        : null,
    placeType: labelForPlaceTypes(data.result.types),
  };
}

function withDistance(
  draft: IWantRestaurantDraft,
  origin?: RestaurantSearchOrigin | null,
): IWantRestaurantDraft {
  if (
    !origin ||
    draft.lat == null ||
    draft.lng == null ||
    !Number.isFinite(draft.lat) ||
    !Number.isFinite(draft.lng)
  ) {
    return draft;
  }
  const km = haversineDistanceKm(
    origin.latitude,
    origin.longitude,
    draft.lat,
    draft.lng,
  );
  const meters = Math.round(km * 1000);
  return {
    ...draft,
    distanceMeters: meters,
    distanceLabel: formatRestaurantDistanceLabel(meters),
  };
}

export async function resolveRestaurantFromMapsLink(
  rawUrl: string,
): Promise<IWantRestaurantDraft> {
  let url = rawUrl.trim();
  let parsed = parseGoogleMapsLink(url);
  if (!parsed) {
    throw new Error('Please paste a valid Google Maps link.');
  }

  if (parsed.isShortLink) {
    url = await resolveShortMapsUrl(url);
    parsed = parseGoogleMapsLink(url) ?? parsed;
  }

  if (parsed.placeId) {
    const details = await fetchPlaceDetails(parsed.placeId);
    return {
      name: details.address.split(',')[0]?.trim() || 'Restaurant',
      googleMapsUrl: rawUrl.trim(),
      placeId: details.placeId,
      address: details.address,
      lat: details.latitude,
      lng: details.longitude,
    };
  }

  if (parsed.query) {
    const suggestions = await fetchPlaceAutocompleteSuggestions(parsed.query, {
      broadTypes: true,
    });
    const top = suggestions[0];
    if (top?.placeId) {
      const details = await fetchPlaceDetails(top.placeId);
      return {
        name:
          top.mainText ||
          details.address.split(',')[0]?.trim() ||
          parsed.query,
        googleMapsUrl: rawUrl.trim(),
        placeId: details.placeId,
        address: details.address || top.formattedAddress || null,
        lat: details.latitude,
        lng: details.longitude,
      };
    }
    const geo = await geocodeAddressToCoordinates(parsed.query);
    return {
      name: parsed.query,
      googleMapsUrl: rawUrl.trim(),
      placeId: geo.placeId ?? null,
      address: geo.address ?? parsed.query,
      lat: geo.latitude,
      lng: geo.longitude,
    };
  }

  if (parsed.lat != null && parsed.lng != null) {
    const geo = await geocodeAddressToCoordinates(
      `${parsed.lat},${parsed.lng}`,
    );
    return {
      name: geo.address.split(',')[0]?.trim() || 'Restaurant from Maps',
      googleMapsUrl: rawUrl.trim(),
      placeId: geo.placeId ?? null,
      address: geo.address,
      lat: parsed.lat,
      lng: parsed.lng,
    };
  }

  throw new Error(
    'Could not read that Maps link. Try searching for the restaurant instead.',
  );
}

async function searchRestaurantsUncached(
  query: string,
  origin?: RestaurantSearchOrigin | null,
): Promise<IWantRestaurantDraft[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const suggestions = await fetchPlaceAutocompleteSuggestions(q, {
    broadTypes: true,
    ...(origin
      ? { origin: { latitude: origin.latitude, longitude: origin.longitude } }
      : {}),
  });

  const out: IWantRestaurantDraft[] = [];
  for (const s of suggestions.slice(0, 6)) {
    if (!s.placeId) continue;
    try {
      const enrich = await fetchRestaurantPlaceEnrichment(s.placeId);
      out.push(
        withDistance(
          {
            name: enrich.name || s.mainText || 'Restaurant',
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enrich.address || s.formattedAddress || s.mainText)}&query_place_id=${encodeURIComponent(s.placeId)}`,
            placeId: s.placeId,
            address: enrich.address || s.secondaryText || s.formattedAddress || null,
            lat: enrich.lat,
            lng: enrich.lng,
            rating: enrich.rating,
            placeType: enrich.placeType,
          },
          origin,
        ),
      );
    } catch {
      out.push(
        withDistance(
          {
            name: s.mainText || 'Restaurant',
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.formattedAddress || s.mainText)}`,
            placeId: s.placeId,
            address: s.secondaryText ?? s.formattedAddress ?? null,
            lat: null,
            lng: null,
            rating: null,
            placeType: null,
          },
          origin,
        ),
      );
    }
  }

  if (origin) {
    out.sort((a, b) => {
      const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
      const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }

  return out;
}

export async function searchRestaurants(
  query: string,
  origin?: RestaurantSearchOrigin | null,
): Promise<IWantRestaurantDraft[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = cacheKey(q, origin);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.rows;
  }

  const existing = inFlightSearches.get(key);
  if (existing) return existing;

  const promise = searchRestaurantsUncached(q, origin)
    .then((rows) => {
      searchCache.set(key, { at: Date.now(), rows });
      return rows;
    })
    .finally(() => {
      inFlightSearches.delete(key);
    });

  inFlightSearches.set(key, promise);
  return promise;
}
