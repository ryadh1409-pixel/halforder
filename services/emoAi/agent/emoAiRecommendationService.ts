import type { EmoAiUserMemory } from '@/types/emoAiAgent';

export type EmoAiMealCandidate = {
  restaurantId: string;
  restaurantName: string;
  name: string;
  price: number;
  isOpen: boolean;
  etaMinutes?: number | null;
  deliveryFee?: number | null;
  discountLabel?: string | null;
};

/** Rank meals for recommendations using memory, time of day, and deal signals. */
export function buildEmoAiRecommendations(args: {
  meals: EmoAiMealCandidate[];
  memory: EmoAiUserMemory | null;
  hour?: number;
  limit?: number;
}): string[] {
  const hour = args.hour ?? new Date().getHours();
  const limit = args.limit ?? 6;
  const favRest = new Set(
    (args.memory?.favoriteRestaurants ?? []).map((s) => s.toLowerCase()),
  );
  const favMeal = new Set((args.memory?.favoriteMeals ?? []).map((s) => s.toLowerCase()));
  const splitSize = args.memory?.preferredSplitSize ?? 2;

  const lunch = hour >= 11 && hour <= 14;
  const dinner = hour >= 17 && hour <= 21;
  const late = hour >= 22 || hour < 5;

  const scored = args.meals
    .filter((m) => m.price > 0)
    .map((m) => {
      let score = 0;
      if (m.isOpen) score += 5;
      if (favRest.has(m.restaurantName.toLowerCase())) score += 8;
      if (favMeal.has(m.name.toLowerCase())) score += 8;
      if (m.price <= 12) score += 3;
      if (m.price <= 10) score += 2;
      if (typeof m.etaMinutes === 'number' && m.etaMinutes <= 35) score += 2;
      if (lunch && /salad|wrap|bowl|sandwich|pizza/i.test(m.name)) score += 2;
      if (dinner && /pizza|burger|pasta|steak|sushi/i.test(m.name)) score += 2;
      if (late && /pizza|burger|noodle|fries/i.test(m.name)) score += 2;
      const share = m.price / Math.max(1, splitSize);
      if (share <= 8) score += 3;
      return { m, score, share };
    })
    .sort((a, b) => b.score - a.score || a.m.price - b.m.price)
    .slice(0, limit);

  return scored.map(({ m, share }) => {
    const splitNote =
      splitSize > 1
        ? ` Split ${splitSize} ways ≈ $${share.toFixed(2)} each.`
        : '';
    const open = m.isOpen ? '' : ' (currently closed)';
    return `${m.restaurantName}: ${m.name} at $${m.price.toFixed(2)}${open}.${splitNote}`;
  });
}

export function findCheapestMealsMatching(
  meals: EmoAiMealCandidate[],
  query: string,
  limit = 5,
): string[] {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  const filtered = meals
    .filter((m) => {
      const hay = `${m.name} ${m.restaurantName}`.toLowerCase();
      if (/pizza/.test(q)) return /pizza/.test(hay);
      if (/burger/.test(q)) return /burger/.test(hay);
      return tokens.some((t) => hay.includes(t)) || hay.includes(q);
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);

  if (!filtered.length) {
    return meals
      .slice()
      .sort((a, b) => a.price - b.price)
      .slice(0, limit)
      .map(
        (m) =>
          `${m.restaurantName} — ${m.name}: $${m.price.toFixed(2)}${m.isOpen ? '' : ' (closed)'}`,
      );
  }
  return filtered.map(
    (m) =>
      `${m.restaurantName} — ${m.name}: $${m.price.toFixed(2)}${m.isOpen ? '' : ' (closed)'}`,
  );
}
