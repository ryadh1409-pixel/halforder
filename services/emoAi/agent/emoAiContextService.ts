import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import { fetchPublicRestaurants } from '@/services/publicRestaurants';
import { safeToMillis } from '@/utils/safeToMillis';

import {
  buildEmoAiRecommendations,
  findCheapestMealsMatching,
  type EmoAiMealCandidate,
} from './emoAiRecommendationService';
import { buildOrderAlerts } from './emoAiOrderIntelligence';
import {
  formatMemoryForPrompt,
  learnFromUserMessage,
  loadEmoAiMemory,
} from './emoAiMemoryService';
import { detectEmoAiAgentIntents } from './emoAiAgentIntents';
import type { EmoAiPlatformContextSnapshot } from '@/types/emoAiAgent';

function readNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function readStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

async function fetchMenuMeals(
  restaurants: { id: string; name: string; isOpen: boolean }[],
): Promise<EmoAiMealCandidate[]> {
  const meals: EmoAiMealCandidate[] = [];
  const sample = restaurants.slice(0, 12);
  await Promise.all(
    sample.map(async (r) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'restaurants', r.id, 'menuItems'), limit(24)),
        );
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          const name = readStr(data.name, data.title);
          const price = readNum(data.price, data.amount, data.basePrice) ?? 0;
          if (!name || price <= 0) continue;
          const discount =
            readNum(data.discountPercent, data.promoPercent) ?? null;
          meals.push({
            restaurantId: r.id,
            restaurantName: r.name,
            name,
            price,
            isOpen: r.isOpen,
            discountLabel: discount ? `${discount}% off` : null,
          });
        }
      } catch {
        /* menu may be restricted */
      }
    }),
  );
  return meals;
}

async function fetchUserOrders(uid: string) {
  const rows: EmoAiPlatformContextSnapshot['userOrders'] = [];
  try {
    const snap = await getDocs(
      query(
        collection(db, 'orders'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(12),
      ),
    );
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      rows.push({
        id: d.id,
        status: readStr(data.status, data.orderStatus) || 'unknown',
        paymentStatus: readStr(data.paymentStatus) || 'unknown',
        deliveryStatus: readStr(data.deliveryStatus) || 'unknown',
        restaurantName: readStr(data.restaurantName, data.partnerName) || 'Restaurant',
        total: readNum(data.total, data.amount, data.grandTotal) ?? 0,
        splitStatus: readStr(data.splitStatus, data.shareStatus) || undefined,
      });
    }
  } catch {
    try {
      const snap = await getDocs(
        query(collection(db, 'orders'), where('customerId', '==', uid), limit(12)),
      );
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        rows.push({
          id: d.id,
          status: readStr(data.status) || 'unknown',
          paymentStatus: readStr(data.paymentStatus) || 'unknown',
          deliveryStatus: readStr(data.deliveryStatus) || 'unknown',
          restaurantName: readStr(data.restaurantName) || 'Restaurant',
          total: readNum(data.total, data.amount) ?? 0,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return rows;
}

async function fetchPromoLabels(): Promise<{ code: string; label: string }[]> {
  try {
    const snap = await getDocs(query(collection(db, 'promoCodes'), limit(20)));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const code = readStr(data.code, d.id);
      const label = readStr(data.label, data.description) || code;
      return { code, label };
    });
  } catch {
    return [];
  }
}

/**
 * Build a live HalfOrder awareness snapshot for Tham (read-only).
 * Failures degrade gracefully to empty sections.
 */
export async function buildEmoAiPlatformContext(args: {
  uid: string | null;
  latestUserMessage?: string | null;
}): Promise<EmoAiPlatformContextSnapshot> {
  const uid = args.uid?.trim() || null;
  const latest = (args.latestUserMessage ?? '').trim();

  if (uid && latest) {
    void learnFromUserMessage(uid, latest);
  }

  const [restaurants, memory, promotions] = await Promise.all([
    fetchPublicRestaurants().catch(() => []),
    loadEmoAiMemory(uid),
    fetchPromoLabels(),
  ]);

  const venueRows = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    location: r.location,
    isOpen: r.isOpen,
  }));

  const meals = await fetchMenuMeals(venueRows);
  const userOrders = uid ? await fetchUserOrders(uid) : [];

  const recommendations = buildEmoAiRecommendations({
    meals: meals.map((m) => ({
      ...m,
      etaMinutes: null,
      deliveryFee: null,
    })),
    memory,
  });

  const orderAlerts = buildOrderAlerts(
    userOrders.map((o) => ({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      deliveryStatus: o.deliveryStatus,
      restaurantName: o.restaurantName,
    })),
  );

  const intents = detectEmoAiAgentIntents(latest);
  const agentHints: string[] = [...intents.hints];
  if (intents.wantsCheapest && intents.foodQuery) {
    agentHints.push(
      `Cheapest matches for "${intents.foodQuery}":\n` +
        findCheapestMealsMatching(meals, intents.foodQuery).join('\n'),
    );
  }
  if (intents.wantsRecommendations) {
    agentHints.push(`Top picks right now:\n${recommendations.slice(0, 4).join('\n')}`);
  }

  return {
    generatedAtMs: Date.now(),
    restaurants: venueRows,
    meals: meals.slice(0, 80).map((m) => ({
      restaurantId: m.restaurantId,
      restaurantName: m.restaurantName,
      name: m.name,
      price: m.price,
      discountLabel: m.discountLabel ?? null,
    })),
    promotions,
    userOrders,
    memory,
    recommendations,
    orderAlerts,
    agentHints,
  };
}

/** Compact system-context block for OpenAI (keep under token budget). */
export function formatPlatformContextForPrompt(
  ctx: EmoAiPlatformContextSnapshot,
): string {
  const openVenues = ctx.restaurants.filter((r) => r.isOpen).slice(0, 15);
  const closedCount = ctx.restaurants.length - openVenues.length;
  const mealLines = ctx.meals
    .slice(0, 25)
    .map(
      (m) =>
        `- ${m.restaurantName}: ${m.name} $${m.price.toFixed(2)}${m.discountLabel ? ` (${m.discountLabel})` : ''}`,
    )
    .join('\n');
  const orderLines = ctx.userOrders
    .slice(0, 6)
    .map(
      (o) =>
        `- ${o.id.slice(0, 8)}… ${o.restaurantName} | status=${o.status} pay=${o.paymentStatus} delivery=${o.deliveryStatus} total=$${o.total.toFixed(2)}`,
    )
    .join('\n');
  const promoLines = ctx.promotions
    .slice(0, 8)
    .map((p) => `- ${p.code}: ${p.label}`)
    .join('\n');

  return [
    'LIVE HALFORDER PLATFORM DATA (authoritative — use these facts; do not invent prices or restaurants):',
    `Snapshot time: ${new Date(ctx.generatedAtMs).toISOString()}`,
    '',
    'Restaurants (sample):',
    openVenues.map((r) => `- ${r.name} @ ${r.location || 'n/a'} (open)`).join('\n') ||
      '- none loaded',
    closedCount > 0 ? `(+${closedCount} closed/other in catalog)` : '',
    '',
    'Menu items (sample with prices):',
    mealLines || '- none loaded',
    '',
    'Active promotions/coupons:',
    promoLines || '- none loaded',
    '',
    "User's recent orders:",
    orderLines || '- none',
    '',
    'Order alerts:',
    ctx.orderAlerts.slice(0, 5).join('\n') || '- none',
    '',
    'Recommendations:',
    ctx.recommendations.slice(0, 5).join('\n') || '- none',
    '',
    'User memory:',
    formatMemoryForPrompt(ctx.memory),
    '',
    'Agent action hints for this turn:',
    ctx.agentHints.slice(0, 8).join('\n') || '- none',
    '',
    'When recommending, cite real names and prices from this data.',
    'If asked to create an order, invite people, apply a coupon, or start matching: explain the exact in-app next step (Orders / Swipe / Wallet vouchers) using live data — do not pretend a write succeeded unless an agent hint confirms it.',
  ]
    .filter(Boolean)
    .join('\n');
}
