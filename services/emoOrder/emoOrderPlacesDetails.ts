/**
 * EmoOrder — Google Places Details enrichment.
 * Fetches photos, opening_hours, reviews, price_level, user_ratings_total.
 * Completely isolated from existing order flows.
 */

import { resolveGoogleMapsApiKey } from '@/lib/maps/googleMapsApiKey';
import type { EmoOrderRestaurantOption, EmoOrderReview } from '@/types/emoOrder';

// ── Types ──────────────────────────────────────────────────────────────────

export type EmoPlaceRichDetails = {
  isOpen: boolean | null;
  photoUrl: string | null;
  reviewCount: number | null;
  priceLevel: number | null;
  cuisineType: string | null;
  reviews: EmoOrderReview[];
};

type GooglePlaceReview = {
  author_name?: string;
  rating?: number;
  text?: string;
  relative_time_description?: string;
};

type GooglePlaceDetailsResult = {
  opening_hours?: { open_now?: boolean };
  photos?: { photo_reference: string; height: number; width: number }[];
  user_ratings_total?: number;
  price_level?: number;
  types?: string[];
  reviews?: GooglePlaceReview[];
};

// ── Cuisine detection from Google types ───────────────────────────────────

const TYPE_TO_CUISINE: Record<string, string> = {
  pizza: 'Pizza',
  burger: 'Burger',
  sushi: 'Sushi',
  japanese: 'Japanese',
  chinese: 'Chinese',
  indian: 'Indian',
  mexican: 'Mexican',
  thai: 'Thai',
  italian: 'Italian',
  french: 'French',
  greek: 'Greek',
  vietnamese: 'Vietnamese',
  korean: 'Korean',
  cafe: 'Café',
  bakery: 'Bakery',
  seafood: 'Seafood',
  steak: 'Steakhouse',
  bbq: 'BBQ',
  chicken: 'Chicken',
  sandwich: 'Sandwiches',
  poke: 'Poke',
};

function cuisineFromTypes(types: string[] | undefined): string | null {
  if (!types?.length) return null;
  for (const t of types) {
    const lower = t.toLowerCase().replace(/_/g, ' ');
    for (const [keyword, label] of Object.entries(TYPE_TO_CUISINE)) {
      if (lower.includes(keyword)) return label;
    }
  }
  if (types.includes('cafe')) return 'Café';
  if (types.includes('bakery')) return 'Bakery';
  if (types.includes('meal_takeaway')) return 'Takeaway';
  if (types.includes('meal_delivery')) return 'Delivery';
  if (types.includes('restaurant')) return 'Restaurant';
  return null;
}

// ── Review keyword extraction ──────────────────────────────────────────────

const REVIEW_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /fresh/i, label: 'Fresh ingredients' },
  { pattern: /friendly|staff|service/i, label: 'Friendly staff' },
  { pattern: /fast|quick|prompt/i, label: 'Fast service' },
  { pattern: /clean/i, label: 'Clean environment' },
  { pattern: /delicious|amazing|great food|excellent food/i, label: 'Delicious food' },
  { pattern: /portion|generous/i, label: 'Generous portions' },
  { pattern: /authentic/i, label: 'Authentic flavours' },
  { pattern: /value|price|afford|cheap/i, label: 'Great value' },
  { pattern: /cozy|atmosphere|vibe/i, label: 'Great atmosphere' },
  { pattern: /recommend/i, label: 'Highly recommended' },
  { pattern: /spicy/i, label: 'Bold spices' },
  { pattern: /cheesy|cheese/i, label: 'Cheesy goodness' },
  { pattern: /crispy|crunchy/i, label: 'Crispy texture' },
  { pattern: /warm|hot/i, label: 'Served hot' },
  { pattern: /variety|options/i, label: 'Great variety' },
];

export function extractKeywordThemes(reviews: EmoOrderReview[]): string[] {
  const allText = reviews.map((r) => r.text).join(' ');
  const found: string[] = [];
  for (const { pattern, label } of REVIEW_KEYWORDS) {
    if (pattern.test(allText) && !found.includes(label)) {
      found.push(label);
      if (found.length >= 4) break;
    }
  }
  return found;
}

// ── Delivery time estimation from distance ─────────────────────────────────

export function estimateDeliveryTime(distanceMeters: number | null): {
  min: number;
  max: number;
} {
  if (distanceMeters == null || distanceMeters <= 0) return { min: 25, max: 40 };
  const km = distanceMeters / 1000;
  if (km < 1) return { min: 12, max: 20 };
  if (km < 2) return { min: 18, max: 28 };
  if (km < 3) return { min: 22, max: 35 };
  if (km < 5) return { min: 28, max: 45 };
  if (km < 7) return { min: 35, max: 55 };
  return { min: 45, max: 65 };
}

// ── Photo URL builder ──────────────────────────────────────────────────────

export function buildPlacePhotoUrl(
  photoReference: string,
  apiKey: string,
  maxWidth = 800,
): string {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${encodeURIComponent(photoReference)}&key=${encodeURIComponent(apiKey)}`;
}

// ── Main fetch ─────────────────────────────────────────────────────────────

/**
 * Fetch rich place details for a single restaurant.
 * Returns partial data on failure rather than throwing.
 */
export async function fetchEmoPlaceRichDetails(
  placeId: string,
): Promise<EmoPlaceRichDetails> {
  const empty: EmoPlaceRichDetails = {
    isOpen: null,
    photoUrl: null,
    reviewCount: null,
    priceLevel: null,
    cuisineType: null,
    reviews: [],
  };

  const apiKey = resolveGoogleMapsApiKey();
  if (!apiKey || !placeId.trim()) return empty;

  try {
    const params = new URLSearchParams({
      place_id: placeId.trim(),
      key: apiKey,
      fields:
        'opening_hours,photos,user_ratings_total,price_level,types,reviews',
    });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return empty;

    const data = (await res.json()) as { status?: string; result?: GooglePlaceDetailsResult };
    if (data.status !== 'OK' || !data.result) return empty;

    const r = data.result;

    // Photo URL
    const photoRef = r.photos?.[0]?.photo_reference;
    const photoUrl = photoRef ? buildPlacePhotoUrl(photoRef, apiKey) : null;

    // Reviews
    const reviews: EmoOrderReview[] = (r.reviews ?? [])
      .filter((rv) => rv.text && rv.text.trim().length > 10)
      .slice(0, 3)
      .map((rv) => ({
        author: rv.author_name?.trim() || 'Anonymous',
        rating: typeof rv.rating === 'number' ? rv.rating : 4,
        text: (rv.text ?? '').trim(),
        timeAgo: rv.relative_time_description?.trim() || '',
      }));

    return {
      isOpen: r.opening_hours?.open_now ?? null,
      photoUrl,
      reviewCount:
        typeof r.user_ratings_total === 'number' ? r.user_ratings_total : null,
      priceLevel:
        typeof r.price_level === 'number' ? Math.min(4, Math.max(1, r.price_level)) : null,
      cuisineType: cuisineFromTypes(r.types),
      reviews,
    };
  } catch {
    return empty;
  }
}

/**
 * Validate that a restaurant is still open right now before payment.
 * Returns { open: true } or { open: false, reason: string }.
 */
export async function validateRestaurantIsOpen(
  placeId: string,
): Promise<{ open: true } | { open: false; reason: string }> {
  const apiKey = resolveGoogleMapsApiKey();
  if (!apiKey || !placeId) {
    // No API key — can't validate, allow through optimistically
    return { open: true };
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId.trim(),
      key: apiKey,
      fields: 'opening_hours,business_status',
    });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return { open: true }; // Network issue — allow through

    const data = (await res.json()) as {
      status?: string;
      result?: {
        business_status?: string;
        opening_hours?: { open_now?: boolean };
      };
    };

    if (data.status !== 'OK') return { open: true };

    const r = data.result;
    const bizStatus = r?.business_status?.toUpperCase();

    if (bizStatus === 'CLOSED_PERMANENTLY') {
      return { open: false, reason: 'This restaurant has permanently closed.' };
    }
    if (bizStatus === 'CLOSED_TEMPORARILY') {
      return { open: false, reason: 'This restaurant is temporarily closed.' };
    }

    const openNow = r?.opening_hours?.open_now;
    if (openNow === false) {
      return { open: false, reason: 'This restaurant is currently closed.' };
    }

    return { open: true };
  } catch {
    return { open: true }; // Network error — allow through
  }
}
