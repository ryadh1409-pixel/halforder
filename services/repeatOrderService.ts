import {
  buildRepeatItemSignature,
  buildRepeatOrderCandidates,
  buildRepeatOrderSchedulePlans,
  formatRepeatEtaMinutes,
  historyFingerprint,
  isInRepeatCardLeadWindow,
  minutesUntilNextUsual,
  pickBestRepeatOrderCandidate,
  reconcileRepeatItemsWithMenu,
  REPEAT_ORDER_CACHE_TTL_MS,
  REPEAT_ORDER_HISTORY_LIMIT,
  summarizeRepeatItems,
  userAlreadyOrderedHabitToday,
} from '@/lib/repeatOrderDetection';
import {
  campaignLabelsForDestination,
  mapFirestoreRestaurant,
} from '@/types/homeRestaurant';
import type {
  RepeatOrderHistoryEntry,
  RepeatOrderItemSnapshot,
  RepeatOrderRecommendation,
  RepeatOrderSchedulePlan,
} from '@/types/repeatOrder';
import { db } from '@/services/firebase';
import {
  readRepeatOrderCache,
  writeRepeatOrderCache,
} from '@/services/repeatOrderCache';
import { syncRepeatOrderNotifications } from '@/services/repeatOrderNotifications';
import { useCartStore } from '@/store/cartStore';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { parseRestaurantIsOpen } from '@/lib/restaurantVenueStatus';

function normStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseHistoryItems(raw: unknown): RepeatOrderItemSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const items: RepeatOrderItemSnapshot[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = normStr(r.id);
    const name = normStr(r.name);
    if (!id && !name) continue;
    items.push({
      id: id || name,
      name: name || 'Item',
      price: Math.max(0, normNum(r.price, 0)),
      qty: Math.max(1, Math.floor(normNum(r.qty, 1))),
      image: typeof r.image === 'string' ? r.image : null,
    });
  }
  return items;
}

function mapCompletedHistoryDoc(
  id: string,
  data: Record<string, unknown>,
): RepeatOrderHistoryEntry | null {
  if (!isOrderCompleted(data)) return null;
  const payment = normStr(data.paymentStatus).toLowerCase();
  if (payment && payment !== 'paid') return null;

  const restaurantId =
    normStr(data.restaurantId) || normStr(data.venueId);
  if (!restaurantId) return null;

  const restaurantObj =
    data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null;
  const restaurantName =
    normStr(data.restaurantName) ||
    normStr(restaurantObj?.name) ||
    'Restaurant';

  const items = parseHistoryItems(data.items);
  if (items.length === 0) return null;

  const orderedAtMs =
    safeToMillis(data.completedAt) ??
    safeToMillis(data.deliveredAt) ??
    (typeof data.completedAtMs === 'number' ? data.completedAtMs : null) ??
    (typeof data.deliveredAtMs === 'number' ? data.deliveredAtMs : null) ??
    safeToMillis(data.createdAt) ??
    0;
  if (!orderedAtMs) return null;

  const totalPrice = Math.max(
    0,
    normNum(data.totalPrice, normNum(data.total, normNum(data.customerTotal, 0))),
  );

  return {
    orderId: id,
    restaurantId,
    restaurantName,
    items,
    itemSignature: buildRepeatItemSignature(items),
    totalPrice,
    orderedAtMs,
    estimatedDeliveryMinutes: Math.max(
      15,
      normNum(data.estimatedDeliveryTime, 35),
    ),
  };
}

async function fetchCompletedOrderHistory(
  uid: string,
): Promise<RepeatOrderHistoryEntry[]> {
  const q = query(
    collection(db, 'orders'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(REPEAT_ORDER_HISTORY_LIMIT),
  );
  const snap = await getDocs(q);
  const rows: RepeatOrderHistoryEntry[] = [];
  for (const d of snap.docs) {
    const mapped = mapCompletedHistoryDoc(
      d.id,
      d.data() as Record<string, unknown>,
    );
    if (mapped) rows.push(mapped);
  }
  return rows;
}

async function fetchMenuMap(
  restaurantId: string,
): Promise<
  Map<
    string,
    {
      id: string;
      name: string;
      price: number;
      image: string | null;
      available: boolean;
    }
  >
> {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      price: number;
      image: string | null;
      available: boolean;
    }
  >();
  try {
    const snap = await getDocs(
      collection(db, 'restaurants', restaurantId, 'menuItems'),
    );
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      map.set(d.id, {
        id: d.id,
        name: normStr(data.name, 'Item'),
        price: Math.max(0, normNum(data.price, 0)),
        image: typeof data.image === 'string' ? data.image : null,
        available: data.available !== false,
      });
    }
  } catch {
    /* menu unavailable */
  }
  return map;
}

async function restaurantIsEligible(
  restaurantId: string,
): Promise<{
  ok: boolean;
  name: string;
  hasOffer: boolean;
  etaLabel: string | null;
}> {
  try {
    const snap = await getDoc(doc(db, 'restaurants', restaurantId));
    if (!snap.exists()) {
      return { ok: false, name: '', hasOffer: false, etaLabel: null };
    }
    const data = snap.data() as Record<string, unknown>;
    if (data.adminEnabled === false) {
      return { ok: false, name: '', hasOffer: false, etaLabel: null };
    }
    if (!parseRestaurantIsOpen(data)) {
      return { ok: false, name: '', hasOffer: false, etaLabel: null };
    }
    const mapped = mapFirestoreRestaurant(restaurantId, data, null, {
      destination: 'home',
    });
    const offerLabels = [
      ...campaignLabelsForDestination(mapped, ['home', 'featured', 'listing']),
      ...(mapped.promoLabels ?? []),
    ].filter(Boolean);
    return {
      ok: true,
      name: mapped.name || normStr(data.name, 'Restaurant'),
      hasOffer: offerLabels.length > 0,
      etaLabel: mapped.etaLabel || null,
    };
  } catch {
    return { ok: false, name: '', hasOffer: false, etaLabel: null };
  }
}

async function hasFoodShareForRestaurantName(
  restaurantName: string,
): Promise<boolean> {
  const target = restaurantName.trim().toLowerCase();
  if (!target) return false;
  try {
    const q = query(
      collection(db, 'adminFoodShares'),
      where('active', '==', true),
      limit(10),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const name = normStr(data.restaurantName).toLowerCase();
      if (name && (name === target || name.includes(target) || target.includes(name))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Build the single best Repeat Order recommendation for a user.
 * Home card only appears in the 0–60 minute lead window before usual time.
 */
export async function computeRepeatOrderRecommendation(
  uid: string,
  prefetchedHistory?: RepeatOrderHistoryEntry[],
): Promise<{
  recommendation: RepeatOrderRecommendation | null;
  historyFingerprint: string;
  schedulePlans: RepeatOrderSchedulePlan[];
  history: RepeatOrderHistoryEntry[];
}> {
  const history =
    prefetchedHistory ?? (await fetchCompletedOrderHistory(uid));
  const fingerprint = historyFingerprint(history.map((h) => h.orderId));
  const empty = {
    recommendation: null as RepeatOrderRecommendation | null,
    historyFingerprint: fingerprint,
    schedulePlans: [] as RepeatOrderSchedulePlan[],
    history,
  };

  if (history.length < 2) return empty;

  const nowMs = Date.now();
  const candidates = buildRepeatOrderCandidates(history, nowMs);
  if (candidates.length === 0) return empty;

  // Enrich offer / share / open flags for schedule copy (best-effort, limited reads).
  const offerByRestaurant: Record<string, boolean> = {};
  const shareByRestaurant: Record<string, boolean> = {};
  const eligibleByRestaurant: Record<string, boolean> = {};
  const uniqueRestaurants = [
    ...new Set(candidates.map((c) => c.restaurantId)),
  ].slice(0, 4);
  await Promise.all(
    uniqueRestaurants.map(async (rid) => {
      const venue = await restaurantIsEligible(rid);
      eligibleByRestaurant[rid] = venue.ok;
      offerByRestaurant[rid] = venue.hasOffer;
      if (venue.ok && venue.name) {
        shareByRestaurant[rid] = await hasFoodShareForRestaurantName(venue.name);
      }
    }),
  );

  const schedulePlans = buildRepeatOrderSchedulePlans(candidates, {
    nowMs,
    offerByRestaurant,
    shareByRestaurant,
    eligibleByRestaurant,
  }).filter((plan) => {
    return !userAlreadyOrderedHabitToday({
      history,
      restaurantId: plan.restaurantId,
      itemSignature: plan.itemSignature,
      nowMs,
    });
  });

  const best = pickBestRepeatOrderCandidate(candidates, {
    nowMs,
    requireLeadWindow: true,
  });
  if (!best) {
    return { ...empty, schedulePlans };
  }

  const { candidate, score, minutesUntil } = best;
  if (!isInRepeatCardLeadWindow(minutesUntil)) {
    return { ...empty, schedulePlans };
  }

  // Hide if already ordered this habit today
  if (
    userAlreadyOrderedHabitToday({
      history,
      restaurantId: candidate.restaurantId,
      itemSignature: candidate.itemSignature,
      nowMs,
    })
  ) {
    return { ...empty, schedulePlans };
  }

  const venue = await restaurantIsEligible(candidate.restaurantId);
  if (!venue.ok) {
    return { ...empty, schedulePlans };
  }

  const menu = await fetchMenuMap(candidate.restaurantId);
  const availableItems = reconcileRepeatItemsWithMenu(candidate.items, menu);
  if (availableItems.length === 0) {
    return { ...empty, schedulePlans };
  }

  const shareAvailable =
    shareByRestaurant[candidate.restaurantId] === true ||
    (await hasFoodShareForRestaurantName(
      venue.name || candidate.restaurantName,
    ));

  const liveSubtotal = availableItems.reduce(
    (sum, i) => sum + i.price * i.qty,
    0,
  );

  const timing = minutesUntilNextUsual({
    usualMinutesOfDay: candidate.usualMinutesOfDay,
    weekdays: candidate.weekdays,
    nowMs,
  });

  return {
    historyFingerprint: fingerprint,
    schedulePlans,
    history,
    recommendation: {
      restaurantId: candidate.restaurantId,
      restaurantName: venue.name || candidate.restaurantName,
      sourceOrderId: candidate.sourceOrderId,
      habitKey: candidate.habitKey,
      habitKind: candidate.habitKind,
      items: candidate.items,
      availableItems,
      previousTotal:
        liveSubtotal > 0 ? liveSubtotal : candidate.totalPrice,
      lastOrderedAtMs: candidate.lastOrderedAtMs,
      estimatedDeliveryLabel:
        venue.etaLabel && venue.etaLabel.trim()
          ? venue.etaLabel
          : formatRepeatEtaMinutes(candidate.estimatedDeliveryMinutes),
      itemsSummary: summarizeRepeatItems(availableItems),
      hasAvailableOffer:
        offerByRestaurant[candidate.restaurantId] === true || venue.hasOffer,
      hasShareAndSave: shareAvailable,
      score,
      confidence: candidate.confidence,
      usualMinutesOfDay: candidate.usualMinutesOfDay,
      weekdays: candidate.weekdays,
      minutesUntilUsual: timing.minutesUntil,
    },
  };
}

export async function loadRepeatOrderRecommendation(input: {
  uid: string;
  /** Force recompute even if cache is fresh. */
  forceRefresh?: boolean;
}): Promise<RepeatOrderRecommendation | null> {
  const { uid, forceRefresh } = input;
  if (!uid.trim()) return null;

  const history = await fetchCompletedOrderHistory(uid);
  const fingerprint = historyFingerprint(history.map((h) => h.orderId));
  const nowMs = Date.now();

  if (!forceRefresh) {
    const cached = await readRepeatOrderCache(uid);
    if (
      cached &&
      cached.historyFingerprint === fingerprint &&
      nowMs - cached.computedAtMs < REPEAT_ORDER_CACHE_TTL_MS
    ) {
      const cachedPlans = (cached.schedulePlans ?? []).filter(
        (p) => p.fireAtMs > nowMs + 10_000,
      );

      // If cached fire times are all past/stale, rebuild plans without dropping the card cache.
      if (cachedPlans.length === 0 && history.length >= 2) {
        const refreshed = await computeRepeatOrderRecommendation(uid, history);
        await writeRepeatOrderCache({
          uid,
          computedAtMs: nowMs,
          historyFingerprint: fingerprint,
          recommendation: refreshed.recommendation ?? cached.recommendation,
          schedulePlans: refreshed.schedulePlans,
        });
        void syncRepeatOrderNotifications({
          uid,
          plans: refreshed.schedulePlans,
          history,
          nowMs,
        });
        // Fall through to card timing checks using refreshed recommendation when present.
        if (refreshed.recommendation) {
          const timing = minutesUntilNextUsual({
            usualMinutesOfDay: refreshed.recommendation.usualMinutesOfDay,
            weekdays:
              refreshed.recommendation.weekdays?.length > 0
                ? refreshed.recommendation.weekdays
                : [new Date(nowMs).getDay()],
            nowMs,
          });
          if (!isInRepeatCardLeadWindow(timing.minutesUntil)) return null;
          const venue = await restaurantIsEligible(
            refreshed.recommendation.restaurantId,
          );
          if (!venue.ok) return null;
          if (
            userAlreadyOrderedHabitToday({
              history,
              restaurantId: refreshed.recommendation.restaurantId,
              itemSignature: buildRepeatItemSignature(
                refreshed.recommendation.availableItems,
              ),
              nowMs,
            })
          ) {
            return null;
          }
          return {
            ...refreshed.recommendation,
            restaurantName:
              venue.name || refreshed.recommendation.restaurantName,
            hasAvailableOffer: venue.hasOffer,
            estimatedDeliveryLabel:
              venue.etaLabel || refreshed.recommendation.estimatedDeliveryLabel,
            minutesUntilUsual: timing.minutesUntil,
          };
        }
      } else if (cachedPlans.length > 0) {
        void syncRepeatOrderNotifications({
          uid,
          plans: cachedPlans,
          history,
          nowMs,
        });
      }

      if (!cached.recommendation) return null;

      // Legacy cache without habit fields — force recompute.
      if (
        typeof cached.recommendation.usualMinutesOfDay !== 'number' ||
        !cached.recommendation.habitKey
      ) {
        /* fall through */
      } else {
      // Re-check timing window — habits are time-sensitive.
      const timing = minutesUntilNextUsual({
        usualMinutesOfDay: cached.recommendation.usualMinutesOfDay,
        weekdays:
          cached.recommendation.weekdays?.length > 0
            ? cached.recommendation.weekdays
            : [new Date(nowMs).getDay()],
        nowMs,
      });
      if (!isInRepeatCardLeadWindow(timing.minutesUntil)) {
        return null;
      }

      const venue = await restaurantIsEligible(
        cached.recommendation.restaurantId,
      );
      if (!venue.ok) {
        await writeRepeatOrderCache({
          uid,
          computedAtMs: nowMs,
          historyFingerprint: fingerprint,
          recommendation: null,
          schedulePlans: cachedPlans,
        });
        return null;
      }

      if (
        userAlreadyOrderedHabitToday({
          history,
          restaurantId: cached.recommendation.restaurantId,
          itemSignature: buildRepeatItemSignature(
            cached.recommendation.availableItems,
          ),
          nowMs,
        })
      ) {
        return null;
      }

      return {
        ...cached.recommendation,
        restaurantName: venue.name || cached.recommendation.restaurantName,
        hasAvailableOffer: venue.hasOffer,
        estimatedDeliveryLabel:
          venue.etaLabel || cached.recommendation.estimatedDeliveryLabel,
        minutesUntilUsual: timing.minutesUntil,
      };
      }
    }
  }

  const computed = await computeRepeatOrderRecommendation(uid, history);
  await writeRepeatOrderCache({
    uid,
    computedAtMs: nowMs,
    historyFingerprint: fingerprint,
    recommendation: computed.recommendation,
    schedulePlans: computed.schedulePlans,
  });

  void syncRepeatOrderNotifications({
    uid,
    plans: computed.schedulePlans,
    history: computed.history,
    nowMs,
  });

  return computed.recommendation;
}


/**
 * Prefill cart from a recommendation and return the checkout route.
 * Never bypasses checkout — caller must navigate to the returned path.
 */
export function rebuildCartFromRepeatOrder(
  recommendation: RepeatOrderRecommendation,
): { ok: true; checkoutPath: string } | { ok: false; error: string } {
  const items = recommendation.availableItems;
  if (!items.length) {
    return { ok: false, error: 'Those items are no longer available.' };
  }
  const store = useCartStore.getState();
  store.clearCart();
  for (const item of items) {
    store.addToCart({
      id: item.id,
      cartLineId: item.id,
      name: item.name,
      price: item.price,
      qty: item.qty,
      image: item.image,
      restaurantId: recommendation.restaurantId,
    });
  }
  store.setActiveRestaurant(recommendation.restaurantId);
  return {
    ok: true,
    checkoutPath: `/restaurant-menu/checkout-premium?restaurantId=${encodeURIComponent(recommendation.restaurantId)}`,
  };
}
