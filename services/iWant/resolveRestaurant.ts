import { haversineDistanceKm } from '@/lib/haversine';
import { pickSavedLocationFieldsFromComponents } from '@/lib/location/addressComponents';
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

export type RestaurantSearchOptions = {
  origin?: RestaurantSearchOrigin | null;
  /** Restrict results to this city (e.g. "Ottawa"). */
  city?: string | null;
};

type PlaceEnrichment = {
  name: string | null;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  placeType: string | null;
  city: string | null;
};

type RankedDraft = IWantRestaurantDraft & { relevanceRank: number };

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

function normalizeCityName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** True when a Places result belongs to the user's current city. */
export function restaurantMatchesCity(
  city: string | null | undefined,
  placeCity: string | null | undefined,
  address: string | null | undefined,
  secondaryText?: string | null,
): boolean {
  const target = normalizeCityName(city);
  if (!target) return true;

  const place = normalizeCityName(placeCity);
  if (place && place === target) return true;

  const haystacks = [address, secondaryText]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => v.toLowerCase());

  for (const hay of haystacks) {
    const parts = hay.split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      // "Ottawa" or "Ottawa ON"
      const locality = part.replace(/\b[a-z]{2}\b/gi, '').replace(/\s+/g, ' ').trim();
      if (locality === target || part === target) return true;
      if (part.startsWith(`${target} `) || part.endsWith(` ${target}`)) return true;
    }
    // Whole-word city match inside the address string
    const re = new RegExp(
      `(^|[,\\s])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[,\\s]|$)`,
      'i',
    );
    if (re.test(hay)) return true;
  }

  return false;
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

function cacheKey(
  query: string,
  origin?: RestaurantSearchOrigin | null,
  city?: string | null,
): string {
  const o =
    origin &&
    Number.isFinite(origin.latitude) &&
    Number.isFinite(origin.longitude)
      ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}`
      : 'none';
  const c = normalizeCityName(city) || 'any';
  return `${query.trim().toLowerCase()}|${o}|${c}`;
}

/**
 * Place Details enrichment for restaurant cards (name, rating, types, city).
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
      city: details.city?.trim() || null,
    };
  }

  const params = new URLSearchParams({
    place_id: placeId.trim(),
    key,
    fields:
      'place_id,name,formatted_address,geometry,rating,types,address_components',
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
      address_components?: {
        long_name?: string;
        short_name?: string;
        types?: string[];
      }[];
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
      city: details.city?.trim() || null,
    };
  }

  const loc = data.result.geometry.location;
  const fields = pickSavedLocationFieldsFromComponents(
    data.result.address_components,
  );
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
    city: fields.city?.trim() || null,
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

function sortRestaurantResults(rows: RankedDraft[]): IWantRestaurantDraft[] {
  const sorted = [...rows].sort((a, b) => {
    const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    const ra = typeof a.rating === 'number' ? a.rating : -1;
    const rb = typeof b.rating === 'number' ? b.rating : -1;
    if (rb !== ra) return rb - ra;

    return a.relevanceRank - b.relevanceRank;
  });

  return sorted.map(({ relevanceRank: _rank, ...rest }) => rest);
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
  options?: RestaurantSearchOptions | null,
): Promise<IWantRestaurantDraft[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const origin = options?.origin ?? null;
  const city = options?.city?.trim() || null;
  const autocompleteInput =
    city && !q.toLowerCase().includes(city.toLowerCase())
      ? `${q} ${city}`
      : q;

  const suggestions = await fetchPlaceAutocompleteSuggestions(autocompleteInput, {
    broadTypes: true,
    ...(origin
      ? { origin: { latitude: origin.latitude, longitude: origin.longitude } }
      : {}),
  });

  const cityFilteredSuggestions = city
    ? suggestions.filter((s) =>
        restaurantMatchesCity(
          city,
          null,
          s.formattedAddress || s.secondaryText,
          s.secondaryText,
        ),
      )
    : suggestions;

  // Prefer city-filtered list; if Autocomplete text filtering was too strict,
  // still enrich a shortlist and hard-filter after Place Details locality.
  const shortlist =
    cityFilteredSuggestions.length > 0
      ? cityFilteredSuggestions
      : suggestions;

  const ranked: RankedDraft[] = [];
  for (let i = 0; i < shortlist.slice(0, 8).length; i++) {
    const s = shortlist[i]!;
    if (!s.placeId) continue;
    try {
      const enrich = await fetchRestaurantPlaceEnrichment(s.placeId);
      if (
        city &&
        !restaurantMatchesCity(
          city,
          enrich.city,
          enrich.address || s.formattedAddress,
          s.secondaryText,
        )
      ) {
        continue;
      }
      ranked.push({
        ...withDistance(
          {
            name: enrich.name || s.mainText || 'Restaurant',
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enrich.address || s.formattedAddress || s.mainText)}&query_place_id=${encodeURIComponent(s.placeId)}`,
            placeId: s.placeId,
            address:
              enrich.address || s.secondaryText || s.formattedAddress || null,
            lat: enrich.lat,
            lng: enrich.lng,
            rating: enrich.rating,
            placeType: enrich.placeType,
          },
          origin,
        ),
        relevanceRank: i,
      });
    } catch {
      if (
        city &&
        !restaurantMatchesCity(
          city,
          null,
          s.secondaryText ?? s.formattedAddress,
          s.secondaryText,
        )
      ) {
        continue;
      }
      ranked.push({
        ...withDistance(
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
        relevanceRank: i,
      });
    }
  }

  return sortRestaurantResults(ranked);
}

export async function searchRestaurants(
  query: string,
  originOrOptions?: RestaurantSearchOrigin | RestaurantSearchOptions | null,
): Promise<IWantRestaurantDraft[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const options: RestaurantSearchOptions =
    originOrOptions &&
    typeof originOrOptions === 'object' &&
    ('latitude' in originOrOptions || 'longitude' in originOrOptions)
      ? { origin: originOrOptions as RestaurantSearchOrigin }
      : ((originOrOptions as RestaurantSearchOptions | null | undefined) ?? {});

  const key = cacheKey(q, options.origin, options.city);
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.rows;
  }

  const existing = inFlightSearches.get(key);
  if (existing) return existing;

  const promise = searchRestaurantsUncached(q, options)
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
