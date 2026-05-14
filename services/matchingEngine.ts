/**
 * Smart + geo matching for growth: scores orders by food overlap and distance,
 * optional OpenAI copy for the assistant UI.
 */
import OpenAI from 'openai';
import Constants from 'expo-constants';
import { getDistance } from 'geolib';
import { getDocs } from 'firebase/firestore';

import {
  GROWTH_MATCH_RADIUS_KM,
  GROWTH_ORDER_SCAN_LIMIT,
} from '../constants/growth';
import { getHiddenUserIds } from './block';
import { auth, syncAuthForFirestoreReads } from './firebase';
import {
  fetchUserRoleWithLog,
  logFirestoreQuery,
  shouldLogFirestoreQueries,
} from './firestoreQueryLog';
import {
  joinDirectoryOrdersQuery,
  JOIN_DIRECTORY_STATUS_VALUES,
  isJoinDirectoryProbeMode,
  type PublicMatchableOrderDoc,
} from './joinDirectoryFirestore';
import { logFirestoreSnapshotResult } from './firestoreAiDebug';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';
import {
  calculateMatchScore,
  foodsAlignForMatch,
  foodPreferenceStrength,
} from './matchScoring';
import { maybeAttemptPublicMatchableDemoSeed } from './publicMatchableDemoClient';

/** Input user for `getSmartMatches` (location + food intent). */
export type GrowthMatchUser = {
  lat: number;
  lng: number;
  food: string;
  uid?: string;
};

/** Alias for `getSmartMatches` input (distinct from Firestore user docs). */
export type User = GrowthMatchUser;

/**
 * Joinable / matchable order row (HalfOrder + classic fields).
 * Alias `Order` is the growth-engine shape (not `lib/orders.Order`).
 */
export type SmartMatchOrder = {
  id: string;
  score: number;
  distanceMeters: number | null;
  foodName: string;
  restaurantName: string;
  status?: string;
  foodType?: string | null;
  restaurantImageUrl?: string | null;
  etaMinutes?: number | null;
  slotsOpen?: number;
  maxSlots?: number;
  /** Host / creator for optional coord fallback. */
  anchorUserId?: string;
};

/** Growth matching result row (alias keeps API as `Order[]` in docs). */
export type Order = SmartMatchOrder;

export type SmartMatchesErrorCode = 'permission-denied' | 'invalid-argument' | 'unknown';

export type SmartMatchesResult = {
  aiText: string;
  nearbyOrders: Order[];
  /** Set when Firestore or client rules block reads (UI can show retry / copy). */
  error?: SmartMatchesErrorCode;
};

const PUBLIC_MATCHABLE_PATH = FIRESTORE_COLLECTIONS.publicMatchableOrders;

function parseFirestoreError(e: unknown): SmartMatchesErrorCode {
  if (!e || typeof e !== 'object') return 'unknown';
  const o = e as { code?: string; message?: string };
  const code = typeof o.code === 'string' ? o.code : '';
  const msg = typeof o.message === 'string' ? o.message.toLowerCase() : '';
  if (
    code === 'permission-denied' ||
    code === 'missing-or-insufficient-permissions' ||
    msg.includes('insufficient permissions')
  ) {
    return 'permission-denied';
  }
  if (code === 'invalid-argument' || code === 'failed-precondition') {
    return 'invalid-argument';
  }
  return 'unknown';
}

function openAiApiKey(): string | undefined {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_OPENAI_API_KEY
      : undefined;
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra =
    typeof extra?.openaiApiKey === 'string' ? extra.openaiApiKey : '';
  return (fromEnv || fromExtra || '').trim() || undefined;
}

function createdAtMillis(data: PublicMatchableOrderDoc): number | null {
  const c = data.createdAt;
  if (c == null) return null;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  if (typeof c === 'object' && c !== null && 'toMillis' in c) {
    const tm = (c as { toMillis?: () => number }).toMillis;
    if (typeof tm === 'function') {
      try {
        const ms = tm.call(c);
        return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function orderFoodHaystackPublic(data: PublicMatchableOrderDoc): string {
  return [
    typeof data.foodName === 'string' ? data.foodName : '',
    typeof data.restaurantName === 'string' ? data.restaurantName : '',
    typeof data.mealType === 'string' ? data.mealType : '',
    typeof data.itemsSummary === 'string' ? data.itemsSummary : '',
    typeof data.foodType === 'string' ? data.foodType : '',
    ...(Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : []),
    typeof data.city === 'string' ? data.city : '',
  ]
    .join(' ')
    .trim();
}

function distanceMeters(
  user: Pick<GrowthMatchUser, 'lat' | 'lng'>,
  point: { lat: number; lng: number } | null,
): number | null {
  if (!point) return null;
  const a = { latitude: user.lat, longitude: user.lng };
  const b = { latitude: point.lat, longitude: point.lng };
  const d = getDistance(a, b);
  return Number.isFinite(d) ? d : null;
}

/** Geo anchor from denormalized join-directory doc (written by Cloud Functions). */
function anchorFromPublicDoc(
  data: PublicMatchableOrderDoc,
): { lat: number; lng: number } | null {
  const latRaw = typeof data.latitude === 'number' ? data.latitude : null;
  const lngRaw = typeof data.longitude === 'number' ? data.longitude : null;
  if (
    latRaw != null &&
    lngRaw != null &&
    Number.isFinite(latRaw) &&
    Number.isFinite(lngRaw)
  ) {
    return { lat: latRaw, lng: lngRaw };
  }
  return null;
}

async function generateAiSuggestion(
  userFood: string,
  matches: Order[],
): Promise<string> {
  const key = openAiApiKey();
  if (!key) {
    if (matches.length === 0) {
      return 'No smart matches available yet — check back soon, or start an order others can join.';
    }
    const top = matches[0]?.foodName ?? 'food';
    return `Found ${matches.length} nearby option(s) for ${userFood || 'you'} — top pick: ${top}. Tap an order below to join.`;
  }
  try {
    const client = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    });
    const lines = matches
      .slice(0, 5)
      .map(
        (m, i) =>
          `${i + 1}. ${m.restaurantName || m.foodName} (~${m.distanceMeters != null ? `${Math.round(m.distanceMeters)}m` : '?'} )`,
      )
      .join('\n');
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You help people split food orders. One short friendly sentence (max 220 chars), no markdown, suggest the best nearby pick.',
        },
        {
          role: 'user',
          content: `User wants: ${userFood || 'something to eat'}.\nNearby:\n${lines || 'none'}`,
        },
      ],
      max_tokens: 120,
      temperature: 0.6,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch (e) {
    if (__DEV__) {
      console.warn('[matchingEngine] OpenAI failed', e);
    }
  }
  return matches.length > 0
    ? `Nearby: ${matches[0].restaurantName || matches[0].foodName} is your closest match.`
    : 'Try again soon for more local matches.';
}

/**
 * Returns ranked nearby orders and optional AI blurb.
 * Does not throw: failures yield empty list + safe `aiText` + optional `error` code.
 */
export async function getSmartMatches(user: GrowthMatchUser): Promise<SmartMatchesResult> {
  if (
    !Number.isFinite(user.lat) ||
    !Number.isFinite(user.lng) ||
    (user.lat === 0 && user.lng === 0)
  ) {
    return {
      aiText: 'Turn on location to see smart nearby matches.',
      nearbyOrders: [],
    };
  }

  await syncAuthForFirestoreReads();
  if (!auth.currentUser) {
    return {
      aiText: 'Sign in to load smart matches from the directory.',
      nearbyOrders: [],
      error: 'permission-denied',
    };
  }

  let roleForLog: string | undefined;
  if (shouldLogFirestoreQueries()) {
    roleForLog = await fetchUserRoleWithLog(auth.currentUser?.uid ?? null);
    logFirestoreQuery('matchingEngine.getDocs', {
      collection: PUBLIC_MATCHABLE_PATH,
      constraints: isJoinDirectoryProbeMode()
        ? { mode: 'PROBE', limit: 5, note: 'EXPO_PUBLIC_MATCHABLE_QUERY_PROBE=1' }
        : {
            where: ['status', 'in', `(${JOIN_DIRECTORY_STATUS_VALUES.length} values)`],
            limit: GROWTH_ORDER_SCAN_LIMIT,
          },
      role: roleForLog,
    });
  }

  try {
    const q = joinDirectoryOrdersQuery(GROWTH_ORDER_SCAN_LIMIT);
    const snap = await getDocs(q);
    logFirestoreSnapshotResult(snap, 'matchingEngine.getSmartMatches');
    if (snap.empty) {
      maybeAttemptPublicMatchableDemoSeed();
      const aiText = await generateAiSuggestion(user.food, []);
      return { aiText, nearbyOrders: [] };
    }
    const now = Date.now();
    const radiusM = GROWTH_MATCH_RADIUS_KM * 1000;
    if (shouldLogFirestoreQueries() && user.uid) {
      logFirestoreQuery('matchingEngine.getHiddenUserIds', {
        collections: [
          `${FIRESTORE_COLLECTIONS.users}/${user.uid}`,
          `users/${user.uid}/blockedUsers`,
          FIRESTORE_COLLECTIONS.blocks,
        ],
        constraints: { parallel: 'getDoc(me) + getDocs(blockedUsers) + 2x getDocs(blocks)' },
        role: roleForLog,
      });
    }
    const hiddenHostIds = user.uid
      ? await getHiddenUserIds(user.uid)
      : new Set<string>();

    type Row = SmartMatchOrder & {
      haystack: string;
      point: { lat: number; lng: number } | null;
    };

    const rows = await Promise.all(
      snap.docs.map(async (d): Promise<Row | null> => {
        const data = d.data() as PublicMatchableOrderDoc;
        const exp =
          typeof data.expiresAt === 'number' ? data.expiresAt : null;
        if (exp != null && exp <= now) return null;

        if (user.uid && data.memberIds?.includes(user.uid)) {
          return null;
        }

        const haystack = orderFoodHaystackPublic(data);
        if (!foodsAlignForMatch(user.food, haystack)) return null;

        const hostId =
          typeof data.hostUserId === 'string' ? data.hostUserId : '';
        if (user.uid && hostId && hostId === user.uid) return null;
        if (hostId && hiddenHostIds.has(hostId)) return null;

        const point = anchorFromPublicDoc(data);
        const dist = distanceMeters(user, point);
        if (dist != null && dist > radiusM) return null;

        const foodName =
          typeof data.foodName === 'string' && data.foodName.trim()
            ? data.foodName.trim()
            : 'Order';
        const restaurantName =
          typeof data.restaurantName === 'string' && data.restaurantName.trim()
            ? data.restaurantName.trim()
            : foodName;

        const foodType =
          typeof data.foodType === 'string' && data.foodType.trim()
            ? data.foodType.trim()
            : null;
        const etaMinutes =
          typeof data.etaMinutes === 'number' && Number.isFinite(data.etaMinutes)
            ? data.etaMinutes
            : null;
        const restaurantImageUrl =
          typeof data.restaurantImageUrl === 'string' && data.restaurantImageUrl.trim()
            ? data.restaurantImageUrl.trim()
            : null;
        const slotsOpen =
          typeof data.slotsOpen === 'number' && Number.isFinite(data.slotsOpen)
            ? data.slotsOpen
            : undefined;
        const maxSlots =
          typeof data.maxSlots === 'number' && Number.isFinite(data.maxSlots)
            ? data.maxSlots
            : undefined;
        const createdAtMs = createdAtMillis(data);
        const foodMatchStrength = foodPreferenceStrength(user.food, haystack);

        const score = calculateMatchScore(
          {
            distanceMeters: dist,
            foodMatchStrength,
            etaMinutes,
            slotsOpen,
            maxSlots,
            createdAtMs,
          },
          user,
          { radiusMeters: radiusM },
        );

        return {
          id: d.id,
          score,
          distanceMeters: dist,
          foodName,
          restaurantName,
          status: typeof data.status === 'string' ? data.status : undefined,
          foodType,
          restaurantImageUrl: restaurantImageUrl || undefined,
          etaMinutes,
          slotsOpen,
          maxSlots,
          anchorUserId: hostId || undefined,
          haystack,
          point,
        };
      }),
    );

    const candidates = rows.filter((x): x is Row => x != null);

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, 12).map(({ haystack: _h, point: _p, ...rest }) => rest);
    const aiText = await generateAiSuggestion(user.food, top);
    return { aiText, nearbyOrders: top };
  } catch (e) {
    const err = parseFirestoreError(e);
    if (shouldLogFirestoreQueries()) {
      logFirestoreQuery('matchingEngine.getSmartMatches.ERROR', {
        constraints: {
          code:
            e && typeof e === 'object' && 'code' in e
              ? String((e as { code?: string }).code)
              : 'unknown',
        },
        role: roleForLog,
      });
    }
    if (__DEV__) {
      console.warn('[matchingEngine] getSmartMatches failed', e);
    }
    if (err === 'permission-denied') {
      return {
        aiText:
          'Could not read the public match directory. Deploy Firestore rules with `public_matchable_orders` read for signed-in users, deploy indexes, and ensure `syncPublicMatchableOrder` is live. Then tap Retry.',
        nearbyOrders: [],
        error: 'permission-denied',
      };
    }
    return {
      aiText: 'Matches are temporarily unavailable. Try again in a moment.',
      nearbyOrders: [],
      error: err,
    };
  }
}
