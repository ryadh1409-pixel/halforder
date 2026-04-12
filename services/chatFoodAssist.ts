/**
 * Action-based food assistant: detect cuisine + area, then Google Places (nearby).
 */
import {
  type ChatRestaurantPick,
  fetchTopCheapestNearbyForChat,
  getCoordinates,
} from '@/services/googlePlaces';

const FOOD_ENTRIES: { match: RegExp; keyword: string }[] = [
  { match: /\bpizza\b/i, keyword: 'pizza' },
  { match: /\bburger(s)?\b/i, keyword: 'burger' },
  { match: /\bsushi\b/i, keyword: 'sushi' },
  { match: /\bramen\b/i, keyword: 'ramen' },
  { match: /\btaco(s)?\b/i, keyword: 'taco' },
  { match: /\bburrito\b/i, keyword: 'burrito' },
  { match: /\bthai\b/i, keyword: 'thai food' },
  { match: /\bindian\b/i, keyword: 'indian food' },
  { match: /\bchinese\b/i, keyword: 'chinese food' },
  { match: /\bkorean\b/i, keyword: 'korean food' },
  { match: /\bpho\b/i, keyword: 'pho' },
  { match: /\bwing(s)?\b/i, keyword: 'wings' },
  { match: /\bsteak\b/i, keyword: 'steakhouse' },
  { match: /\bhealthy\b|\bsalad\b/i, keyword: 'healthy restaurant' },
  { match: /\bbbq\b|\bbarbecue\b/i, keyword: 'bbq' },
  { match: /\bdim sum\b/i, keyword: 'dim sum' },
];

export type FoodPlaceAssistOutcome =
  | { kind: 'noop' }
  | { kind: 'need_location'; foodKeyword: string }
  | {
      kind: 'found';
      foodKeyword: string;
      locationLabel: string;
      picks: ChatRestaurantPick[];
      intro: string;
    };

/** Returns Places keyword (e.g. "pizza") or null */
export function detectFoodKeyword(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const { match, keyword } of FOOD_ENTRIES) {
    if (match.test(t)) return keyword;
  }
  return null;
}

/** "pizza in North York" → "North York" */
export function extractLocationFromMessage(text: string): string | null {
  const m = text.match(/\b(?:in|near|around|at)\s+([^.!?\n]{2,70})/i);
  if (m?.[1]) {
    const s = m[1].trim().replace(/\s+$/i, '');
    if (s.length >= 2) return s;
  }
  return null;
}

function priceLevelLabel(level: number | null): string {
  if (level == null) return 'Price n/a';
  if (level === 0) return 'Free';
  return '$'.repeat(Math.min(level, 4));
}

export function formatFoodAssistMessage(
  foodKeyword: string,
  locationLabel: string,
  picks: ChatRestaurantPick[],
): string {
  if (picks.length === 0) {
    return `No ${foodKeyword} spots found near ${locationLabel}. Try another area or cuisine.`;
  }
  const head = `Top ${picks.length} ${foodKeyword} near ${locationLabel} (budget-friendly first):\n`;
  const lines = picks.map((p, i) => {
    const price = priceLevelLabel(p.priceLevel);
    return `${i + 1}. ${p.name}\n   ★${p.rating.toFixed(1)} · ${price}\n   ${p.address}`;
  });
  return head + '\n' + lines.join('\n\n');
}

/**
 * If food intent is present and we have either a text location (geocoded) or profile GPS,
 * fetches top cheap nearby restaurants. Otherwise asks for location.
 */
export async function runFoodPlaceAssist(
  message: string,
  profileCoords: { lat: number; lng: number } | null,
): Promise<FoodPlaceAssistOutcome> {
  const food = detectFoodKeyword(message);
  if (!food) return { kind: 'noop' };

  const explicit = extractLocationFromMessage(message);

  let lat: number;
  let lng: number;
  let locationLabel: string;

  if (explicit) {
    const coords = await getCoordinates(explicit);
    if (!coords) {
      return { kind: 'need_location', foodKeyword: food };
    }
    lat = coords.lat;
    lng = coords.lng;
    locationLabel = explicit;
  } else if (profileCoords) {
    lat = profileCoords.lat;
    lng = profileCoords.lng;
    locationLabel = 'near you';
  } else {
    return { kind: 'need_location', foodKeyword: food };
  }

  const picks = await fetchTopCheapestNearbyForChat(lat, lng, food, 3);
  const intro = formatFoodAssistMessage(food, locationLabel, picks);

  return {
    kind: 'found',
    foodKeyword: food,
    locationLabel,
    picks,
    intro,
  };
}
