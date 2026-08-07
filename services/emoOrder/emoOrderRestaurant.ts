/**
 * EmoOrder — restaurant discovery with real-time rich data.
 *
 * Uses Google Places Nearby Search (the correct API for location-based category
 * discovery) with progressive radius retry: 3km → 5km → 8km → 12km.
 * Falls back to Text Search if Nearby Search yields nothing.
 *
 * Completely isolated from Food Share / Pick Up / existing order lifecycle.
 */

import {
  fetchPlacesNearbySearch,
  fetchPlacesTextSearch,
  type NearbyRestaurantResult,
} from '@/services/places/googlePlacesClient';
import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';
import {
  buildPlacePhotoUrl,
  estimateDeliveryTime,
  extractKeywordThemes,
  fetchEmoPlaceRichDetails,
} from './emoOrderPlacesDetails';
import type { EmoOrderRestaurantOption } from '@/types/emoOrder';

export type EmoOrderSearchCoords = { latitude: number; longitude: number };

// Progressive radius stages in metres
const RADIUS_STAGES = [3_000, 5_000, 8_000, 12_000] as const;
const MIN_RESULTS_PER_STAGE = 3; // move to next stage if fewer than this

// ── Coordinate distance helper ────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceLabel(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters)}m`;
  return `${(meters / 1_000).toFixed(1)}km`;
}

// ── Mapping ───────────────────────────────────────────────────────────────

function mapNearbyToBase(
  r: NearbyRestaurantResult,
  userCoords: EmoOrderSearchCoords,
): EmoOrderRestaurantOption {
  const distanceMeters = haversineMeters(
    userCoords.latitude,
    userCoords.longitude,
    r.lat,
    r.lng,
  );
  const deliveryTime = estimateDeliveryTime(distanceMeters);
  const googleMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(r.name)}&place_id=${r.placeId}`;

  // Build photo URL directly from Nearby Search result — avoids a redundant Details API call
  const apiKey = resolveGoogleMapsApiKey();
  const photoUrl = r.photoReference && apiKey
    ? buildPlacePhotoUrl(r.photoReference, apiKey, 800)
    : null;

  return {
    id: r.placeId,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    rating: r.rating,
    reviewCount: r.reviewCount,
    distanceLabel: distanceLabel(distanceMeters),
    distanceMeters,
    placeId: r.placeId,
    googleMapsUrl,
    placeType: null,
    cuisineType: null,
    priceLevel: r.priceLevel,
    photoUrl,
    // Nearby Search returns open_now — use it immediately (no extra Details call needed)
    isOpen: r.isOpen,
    deliveryTimeMin: deliveryTime.min,
    deliveryTimeMax: deliveryTime.max,
    reviews: [],
  };
}

// ── Enrichment (Places Details for reviews + photo) ───────────────────────

async function enrichWithPlaceDetails(
  option: EmoOrderRestaurantOption,
): Promise<EmoOrderRestaurantOption> {
  if (!option.placeId) return option;
  try {
    const rich = await fetchEmoPlaceRichDetails(option.placeId);
    return {
      ...option,
      // Only upgrade isOpen / photoUrl if Nearby Search didn't already give us a value
      isOpen: option.isOpen ?? rich.isOpen,
      photoUrl: option.photoUrl ?? rich.photoUrl,
      reviewCount: rich.reviewCount ?? option.reviewCount,
      priceLevel: rich.priceLevel ?? option.priceLevel,
      cuisineType: rich.cuisineType ?? option.cuisineType,
      reviews: rich.reviews,
    };
  } catch {
    return option;
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────

function deduplicateByPlaceId(
  results: NearbyRestaurantResult[],
): NearbyRestaurantResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.placeId)) return false;
    seen.add(r.placeId);
    return true;
  });
}

// ── Progressive Nearby Search ─────────────────────────────────────────────

async function nearbySearchWithRetry(
  keyword: string,
  coords: EmoOrderSearchCoords,
  limit: number,
): Promise<NearbyRestaurantResult[]> {
  let accumulated: NearbyRestaurantResult[] = [];

  for (const radiusM of RADIUS_STAGES) {
    console.log('[EmoOrder][Discovery] Trying radius', radiusM, 'for keyword:', keyword);

    const results = await fetchPlacesNearbySearch(coords, radiusM, keyword);

    // Merge and deduplicate across stages
    accumulated = deduplicateByPlaceId([...accumulated, ...results]);

    console.log('[EmoOrder][Discovery] Accumulated after', radiusM, 'm:', accumulated.length, 'results');

    if (accumulated.length >= MIN_RESULTS_PER_STAGE) {
      // Got enough — no need to expand radius further
      break;
    }
  }

  return accumulated;
}

// ── Text Search fallback ──────────────────────────────────────────────────

async function textSearchFallback(
  keyword: string,
  city: string | null,
  coords: EmoOrderSearchCoords,
): Promise<NearbyRestaurantResult[]> {
  const cityPart = city?.trim() ? ` in ${city.trim()}` : '';
  const query = `${keyword}${cityPart} restaurant`;

  console.log('[EmoOrder][Discovery] Falling back to Text Search, query:', query);

  const results = await fetchPlacesTextSearch(query, coords, 12_000);

  console.log('[EmoOrder][Discovery] Text Search returned', results.length, 'results');

  return results;
}

// ── Core search + enrich pipeline ────────────────────────────────────────

async function searchAndEnrich(
  keyword: string,
  coords: EmoOrderSearchCoords,
  city: string | null,
  limit = 5,
): Promise<EmoOrderRestaurantOption[]> {
  console.log('[EmoOrder][Discovery] Starting search', {
    keyword,
    lat: coords.latitude.toFixed(5),
    lng: coords.longitude.toFixed(5),
    city,
    limit,
  });

  // ── Step 1: Nearby Search with progressive radius ──────────────────────
  let rawResults = await nearbySearchWithRetry(keyword, coords, limit);

  // ── Step 2: Text Search fallback if still too few ─────────────────────
  if (rawResults.length < MIN_RESULTS_PER_STAGE) {
    console.log('[EmoOrder][Discovery] Nearby Search insufficient, trying Text Search');
    const fallback = await textSearchFallback(keyword, city, coords);
    rawResults = deduplicateByPlaceId([...rawResults, ...fallback]);
  }

  console.log('[EmoOrder][Discovery] Raw results before filtering:', rawResults.length);

  // ── Step 3: Filter — only open (Nearby Search gives us open_now for free) ──
  const openRaw = rawResults.filter((r) => {
    if (r.isOpen === false) {
      console.log('[EmoOrder][Discovery] Excluded (closed):', r.name);
      return false;
    }
    return true;
  });

  console.log('[EmoOrder][Discovery] Open after filter:', openRaw.length);

  // ── Step 4: Sort by rating × review count (prominence proxy) ──────────
  openRaw.sort((a, b) => {
    const scoreA = (a.rating ?? 0) * Math.log10(Math.max(1, a.reviewCount ?? 0) + 1);
    const scoreB = (b.rating ?? 0) * Math.log10(Math.max(1, b.reviewCount ?? 0) + 1);
    return scoreB - scoreA;
  });

  // ── Step 5: Map to EmoOrderRestaurantOption ────────────────────────────
  const baseOptions = openRaw
    .slice(0, limit + 2) // +2 buffer for any that fail enrichment
    .map((r) => mapNearbyToBase(r, coords));

  // ── Step 6: Enrich with Places Details (reviews, photo, cuisine) ───────
  console.log('[EmoOrder][Discovery] Enriching', baseOptions.length, 'candidates');
  const enriched = await Promise.all(baseOptions.map(enrichWithPlaceDetails));

  // ── Step 7: Final open check after enrichment ──────────────────────────
  const finalOpen = enriched.filter((r) => {
    if (r.isOpen === false) {
      console.log('[EmoOrder][Discovery] Excluded post-enrichment (closed):', r.name);
      return false;
    }
    return true;
  });

  const finalResults = finalOpen.slice(0, limit);

  console.log('[EmoOrder][Discovery] Final results returned:', finalResults.length, finalResults.map((r) => r.name));

  return finalResults;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Find the best nearby restaurants for the concierge.
 * Returns up to 5 open results, sorted by rating × review prominence.
 */
export async function findNearbyRestaurantsForConcierge(
  coords: EmoOrderSearchCoords,
  city: string | null,
  query?: string,
): Promise<EmoOrderRestaurantOption[]> {
  const keyword = query?.trim() || 'restaurant';
  try {
    return await searchAndEnrich(keyword, coords, city, 5);
  } catch (err) {
    console.error('[EmoOrder][Discovery] findNearbyRestaurantsForConcierge failed:', err);
    return [];
  }
}

/**
 * Search restaurants matching a specific cuisine / food keyword.
 */
export async function searchRestaurantsForConcierge(
  keyword: string,
  coords: EmoOrderSearchCoords,
  city: string | null,
): Promise<EmoOrderRestaurantOption[]> {
  try {
    return await searchAndEnrich(keyword.trim(), coords, city, 5);
  } catch (err) {
    console.error('[EmoOrder][Discovery] searchRestaurantsForConcierge failed:', err);
    return [];
  }
}

/**
 * Extract keyword themes from a restaurant's reviews.
 * Used to generate the "customers frequently mention" section.
 */
export { extractKeywordThemes };
