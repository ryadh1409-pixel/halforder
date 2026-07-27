import { parseGoogleMapsLink } from '@/lib/maps/parseGoogleMapsLink';
import {
  fetchPlaceAutocompleteSuggestions,
  fetchPlaceDetails,
  geocodeAddressToCoordinates,
} from '@/services/places/googlePlacesClient';
import type { IWantRestaurantDraft } from '@/types/iWant';

async function resolveShortMapsUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.url || url;
  } catch {
    return url;
  }
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

export async function searchRestaurants(
  query: string,
): Promise<IWantRestaurantDraft[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const suggestions = await fetchPlaceAutocompleteSuggestions(q, {
    broadTypes: true,
  });
  const out: IWantRestaurantDraft[] = [];
  for (const s of suggestions.slice(0, 6)) {
    if (!s.placeId) continue;
    try {
      const details = await fetchPlaceDetails(s.placeId);
      out.push({
        name: s.mainText || 'Restaurant',
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.formattedAddress || s.mainText)}&query_place_id=${encodeURIComponent(s.placeId)}`,
        placeId: details.placeId,
        address: details.address || s.secondaryText || null,
        lat: details.latitude,
        lng: details.longitude,
      });
    } catch {
      out.push({
        name: s.mainText || 'Restaurant',
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.formattedAddress || s.mainText)}`,
        placeId: s.placeId,
        address: s.secondaryText ?? s.formattedAddress ?? null,
        lat: null,
        lng: null,
      });
    }
  }
  return out;
}
