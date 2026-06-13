import { getHiddenUserIds } from './block';
import {
  joinDirectoryOrdersQuery,
  isJoinDirectoryProbeMode,
  type PublicMatchableOrderDoc,
} from './joinDirectoryFirestore';
import { auth, syncAuthForFirestoreReads } from './firebase';
import {
  fetchUserRoleWithLog,
  logFirestoreQuery,
  shouldLogFirestoreQueries,
} from './firestoreQueryLog';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';
import { logFirestoreSnapshotResult } from './firestoreAiDebug';
import { getDocs } from 'firebase/firestore';

const FOOD_INTENT_KEYWORDS = [
  'pizza',
  'hungry',
  'food',
  'order',
  'eat',
  'meal',
  'lunch',
  'dinner',
  'burger',
  'snack',
  'restaurant',
  'healthy',
  'salad',
  'bowl',
  'other meal',
] as const;

export type AssistantOrderSummary = {
  id: string;
  restaurantName: string;
  mealType?: string;
  itemsSummary?: string;
  status?: string;
  /** Order owner / host for moderation filtering. */
  hostUserId?: string;
};

export type TimeOfDayPeriod = 'morning' | 'lunch' | 'evening' | 'late_night';

export type TimeContext = {
  period: TimeOfDayPeriod;
  greetingLabel: string;
  segmentEmoji: string;
  matchKeywords: readonly string[];
  emptyLabel: string;
  emptyEmoji: string;
  /** Shown in “I found N {fallbackFood} orders” when no keyword match in copy. */
  fallbackFood: string;
};

/**
 * Local wall-clock windows:
 * Morning 5–11, Lunch 11–15, Evening 15–20, Late night 20–5.
 */
export function detectTimeContext(date: Date = new Date()): TimeContext {
  const h = date.getHours();
  if (h >= 5 && h < 11) {
    return {
      period: 'morning',
      greetingLabel: 'Morning',
      segmentEmoji: '🌅',
      matchKeywords: [
        'bakery',
        'breakfast',
        'bagel',
        'donut',
        'muffin',
        'croissant',
        'pastry',
        'brunch',
        'egg',
        'avo',
      ],
      emptyLabel: 'breakfast',
      emptyEmoji: '🥐',
      fallbackFood: 'breakfast',
    };
  }
  if (h >= 11 && h < 15) {
    return {
      period: 'lunch',
      greetingLabel: 'Lunch time',
      segmentEmoji: '🍔',
      matchKeywords: [
        'pizza',
        'burger',
        'sandwich',
        'bowl',
        'taco',
        'burrito',
        'ramen',
        'salad',
        'wings',
        'fried',
        'pho',
        'fast',
        'sub',
      ],
      emptyLabel: 'lunch',
      emptyEmoji: '🍕',
      fallbackFood: 'pizza',
    };
  }
  if (h >= 15 && h < 20) {
    return {
      period: 'evening',
      greetingLabel: 'Evening',
      segmentEmoji: '🍽️',
      matchKeywords: [
        'dinner',
        'steak',
        'pasta',
        'sushi',
        'curry',
        'grill',
        'seafood',
        'thai',
        'italian',
        'korean',
        'bbq',
        'bistro',
        'fine',
      ],
      emptyLabel: 'dinner',
      emptyEmoji: '🍝',
      fallbackFood: 'dinner',
    };
  }
  return {
    period: 'late_night',
    greetingLabel: 'Late night',
    segmentEmoji: '🌙',
    matchKeywords: [
      'snack',
      'fries',
      'cheap',
      'pizza',
      'wings',
      'dessert',
      'kebab',
      'diner',
      '24',
      'ice cream',
      'treat',
      'value',
      'combo',
    ],
    emptyLabel: 'late-night',
    emptyEmoji: '🍟',
    fallbackFood: 'snack',
  };
}

export function detectFoodIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return FOOD_INTENT_KEYWORDS.some((kw) => normalized.includes(kw));
}

function orderHaystack(order: AssistantOrderSummary): string {
  return [
    order.restaurantName,
    order.mealType ?? '',
    order.itemsSummary ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function orderMatchesTimeKeywords(
  order: AssistantOrderSummary,
  keywords: readonly string[],
): boolean {
  const hay = orderHaystack(order);
  return keywords.some((kw) => hay.includes(kw.toLowerCase()));
}

export function filterOrdersByTimeContext(
  orders: AssistantOrderSummary[],
  ctx: TimeContext,
): AssistantOrderSummary[] {
  return orders.filter((o) =>
    orderMatchesTimeKeywords(o, ctx.matchKeywords),
  );
}

/** First keyword from context that appears in any order text (for intro copy). */
export function pickHighlightFoodWord(
  orders: AssistantOrderSummary[],
  ctx: TimeContext,
): string {
  const keywords = [...ctx.matchKeywords];
  for (const order of orders) {
    const hay = orderHaystack(order);
    for (const kw of keywords) {
      if (hay.includes(kw.toLowerCase())) {
        return kw;
      }
    }
  }
  return ctx.fallbackFood;
}

export function buildSmartMatchIntroText(
  ctx: TimeContext,
  orders: AssistantOrderSummary[],
): string {
  const n = orders.length;
  if (n === 0) {
    return 'No active orders yet — start one and others can join.';
  }
  const food = pickHighlightFoodWord(orders, ctx);
  return `${ctx.greetingLabel} ${ctx.segmentEmoji} There ${n === 1 ? 'is' : 'are'} ${n} open ${food} order${n === 1 ? '' : 's'} you can join.`;
}

/**
 * Fetches active orders, filters by time-of-day keywords, returns up to `maxResults`.
 */
export async function fetchActiveJoinableOrdersForContext(
  ctx: TimeContext,
  maxResults: number,
  scanLimit: number = 48,
  viewerUid?: string | null,
): Promise<AssistantOrderSummary[]> {
  await syncAuthForFirestoreReads();

  let roleForLog: string | undefined;
  if (shouldLogFirestoreQueries()) {
    roleForLog = await fetchUserRoleWithLog(auth.currentUser?.uid ?? null);
    logFirestoreQuery('chatAssistantOrders.fetchActiveJoinableOrdersForContext', {
      collection: FIRESTORE_COLLECTIONS.publicMatchableOrders,
      constraints: isJoinDirectoryProbeMode()
        ? { mode: 'PROBE', limit: 5 }
        : {
            where: ['status', 'in', '(join directory)'],
            limit: scanLimit,
          },
      role: roleForLog,
    });
  }

  let snap: Awaited<ReturnType<typeof getDocs>>;
  try {
    const q = joinDirectoryOrdersQuery(scanLimit);
    snap = await getDocs(q);
    logFirestoreSnapshotResult(
      snap as import('firebase/firestore').QuerySnapshot<import('firebase/firestore').DocumentData>,
      'chatAssistantOrders.fetchActiveJoinableOrdersForContext',
    );
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (shouldLogFirestoreQueries()) {
      logFirestoreQuery('chatAssistantOrders.fetchActiveJoinableOrdersForContext.ERROR', {
        collection: FIRESTORE_COLLECTIONS.publicMatchableOrders,
        constraints: { code },
        role: roleForLog,
      });
    }
    if (__DEV__) {
      console.warn('[chatAssistantOrders] fetchActiveJoinableOrdersForContext', e);
    }
    if (code === 'permission-denied' || code === 'missing-or-insufficient-permissions') {
      return [];
    }
    return [];
  }

  const now = Date.now();
  const summaries: AssistantOrderSummary[] = [];
  if (shouldLogFirestoreQueries() && viewerUid?.trim()) {
    logFirestoreQuery('chatAssistantOrders.getHiddenUserIds', {
      collections: [
        `${FIRESTORE_COLLECTIONS.users}/${viewerUid.trim()}`,
        `users/${viewerUid.trim()}/blockedUsers`,
        FIRESTORE_COLLECTIONS.blocks,
      ],
      role: roleForLog,
    });
  }
  const hidden =
    viewerUid && viewerUid.trim()
      ? await getHiddenUserIds(viewerUid.trim())
      : null;

  for (const d of snap.docs) {
    const data = d.data() as PublicMatchableOrderDoc;
    const exp =
      typeof data.expiresAt === 'number' ? data.expiresAt : null;
    if (exp != null && exp <= now) {
      continue;
    }
    const itemsSummary =
      typeof data.itemsSummary === 'string'
        ? data.itemsSummary
        : typeof data.foodName === 'string'
          ? data.foodName
          : undefined;
    const hostUserId =
      typeof data.hostUserId === 'string' && data.hostUserId.trim()
        ? data.hostUserId.trim()
        : undefined;
    if (viewerUid && data.memberIds && data.memberIds.includes(viewerUid)) {
      continue;
    }
    if (hostUserId && hidden?.has(hostUserId)) {
      continue;
    }
    summaries.push({
      id: d.id,
      restaurantName:
        typeof data.restaurantName === 'string' && data.restaurantName.trim()
          ? data.restaurantName.trim()
          : 'Order',
      mealType:
        typeof data.mealType === 'string' ? data.mealType : undefined,
      itemsSummary,
      status: typeof data.status === 'string' ? data.status : undefined,
      hostUserId,
    });
  }

  const matched = filterOrdersByTimeContext(summaries, ctx);
  return matched.slice(0, maxResults);
}
