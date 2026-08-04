import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { resolveFoodShareFulfillmentMode } from '@/lib/foodShareFulfillment';
import { buildAdminShareCostBreakdown } from '@/lib/foodSharePricing';
import {
  isAdminFoodShareLive,
  nextAvailabilityBoundaryDelay,
} from '@/lib/adminFoodShareAvailability';
import {
  emptySwipeQueueMarketplaceState,
  resolveSwipeMarketplaceStatus,
  swipeMarketplacePeopleJoined,
  swipeMarketplaceSpotsLeft,
  type SwipeQueueMarketplaceState,
} from '@/lib/swipeMarketplaceStatus';
import {
  isFoodShareDollarPromoEnabled,
  parseFoodShareDollarPromoTarget,
  resolveFoodShareDollarPromoTargetPrice,
} from '@/lib/foodShareDollarPromo';
import {
  parsePromotionBadge,
  promotionBadgesFromData,
  promotionDestinationsFromData,
  promotionVisibleOn,
} from '@/lib/promotionBadge';
import { getHeroImageUrlForType, mockOrders } from '@/constants/mockSwipeFood';
import type { FoodOrderType } from '@/constants/mockSwipeFood';
import { db } from '@/services/firebase';
import type { AdminFoodShareDoc } from '@/types/foodShare';
import type { SwipeFoodCard } from '@/types/swipe';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  documentId,
  limit,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

const DECK_LIMIT = 10;

function normStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function inferFoodType(name: string): FoodOrderType {
  const raw = name.toLowerCase();
  if (raw.includes('burger')) return 'burger';
  if (raw.includes('noodle') || raw.includes('ramen')) return 'noodles';
  if (raw.includes('salad') || raw.includes('bowl')) return 'salad';
  if (raw.includes('cake') || raw.includes('dessert') || raw.includes('chocolate')) {
    return 'dessert';
  }
  if (raw.includes('pizza')) return 'pizza';
  return 'other';
}

function normBool(value: unknown): boolean {
  return value === true || value === 1 || value === 'true';
}

export function mapAdminFoodShareDoc(
  id: string,
  data: Record<string, unknown>,
): AdminFoodShareDoc {
  const promotionBadges = promotionBadgesFromData(data);
  const fulfillmentMode = resolveFoodShareFulfillmentMode(data);
  return {
    id,
    foodName: normStr(data.foodName, normStr(data.title, 'Shared meal')),
    restaurantName: normStr(data.restaurantName, 'HalfOrder'),
    image: normStr(data.image, normStr(data.foodImageUrl)),
    originalPrice: normNum(data.originalPrice, normNum(data.price, 0)),
    sharedPrice: normNum(
      data.sharedPrice,
      normNum(data.sharingPrice, normNum(data.splitPrice, 0)),
    ),
    deliveryShare:
      fulfillmentMode === 'pickup'
        ? 0
        : normNum(data.deliveryShare, normNum(data.deliveryCost, 0)),
    description: normStr(data.description, normStr(data.aiDescription)),
    active: normBool(data.active),
    createdAtMs: safeToMillis(data.createdAt),
    availableFromMs: safeToMillis(data.availableFrom),
    availableUntilMs: safeToMillis(data.availableUntil),
    fulfillmentMode,
    promotionBadge: promotionBadges[0] ?? parsePromotionBadge(data.promotionBadge),
    promotionBadges,
    promotionDestinations: promotionDestinationsFromData(data),
    promotion1DollarEnabled: isFoodShareDollarPromoEnabled(
      data.promotion1DollarEnabled,
    ),
    promotion1DollarTarget: parseFoodShareDollarPromoTarget(
      data.promotion1DollarTarget,
    ),
  };
}

export function adminFoodShareToSwipeCard(
  share: AdminFoodShareDoc,
  queue?: SwipeQueueMarketplaceState | null,
): SwipeFoodCard {
  const breakdown = buildAdminShareCostBreakdown(
    share.originalPrice,
    share.sharedPrice,
    share.deliveryShare,
    {
      fulfillmentMode: share.fulfillmentMode,
      promotionBadges: share.promotionBadges,
      // Treat the swipe viewer as potential 'first' participant — same assumption
      // as the waiting screen. Aligns swipe price with pricing summary & checkout.
      promoTargetPrice: resolveFoodShareDollarPromoTargetPrice({
        enabled: share.promotion1DollarEnabled,
        target: share.promotion1DollarTarget,
        participant: 'first',
      }),
      shareRaw: {
        promotionBadges: share.promotionBadges,
        promotionBadge: share.promotionBadge,
        fulfillmentMode: share.fulfillmentMode,
      },
    },
  );
  const type = inferFoodType(share.foodName);
  const showSwipePromo = promotionVisibleOn(
    {
      promotionBadges: share.promotionBadges,
      promotionBadge: share.promotionBadge,
      promotionDestinations: share.promotionDestinations,
    },
    'swipe',
  );
  const isPickup = share.fulfillmentMode === 'pickup';
  const marketplaceStatus = resolveSwipeMarketplaceStatus(
    queue ?? emptySwipeQueueMarketplaceState(),
  );
  const peopleJoined = swipeMarketplacePeopleJoined(marketplaceStatus);
  const spotsLeft = swipeMarketplaceSpotsLeft(marketplaceStatus);

  return {
    id: share.id,
    adminFoodShareId: share.id,
    title: share.foodName,
    restaurantName: share.restaurantName,
    restaurantId: `admin-share-${share.id}`,
    type,
    originalPrice: breakdown.originalPrice,
    sharedPrice: breakdown.sharedPrice,
    deliveryShare: breakdown.deliveryShare,
    totalPerUser: breakdown.displaySubtotal,
    pricing: breakdown,
    price: breakdown.displaySubtotal,
    description: share.description,
    splitPriceLabel: isPickup
      ? `${breakdown.sharedPrice.toFixed(2)} food + free pickup`
      : `${breakdown.sharedPrice.toFixed(2)} food + ${breakdown.deliveryShare.toFixed(2)} delivery`,
    distance: isPickup ? 'Admin pickup share' : 'Admin meal share',
    spotsLeft,
    peopleJoined,
    marketplaceStatus,
    heroImageUri: share.image || getHeroImageUrlForType(type),
    orderStatus: null,
    deliveryStatus: null,
    lifecycle:
      marketplaceStatus === 'matched' || marketplaceStatus === 'ready'
        ? 'MATCHED'
        : 'WAITING_FOR_PARTNER',
    fulfillmentMode: share.fulfillmentMode,
    availableFromMs: share.availableFromMs,
    availableUntilMs: share.availableUntilMs,
    promotionBadge: showSwipePromo ? share.promotionBadge : 'none',
    promotionBadges: showSwipePromo ? share.promotionBadges : [],
  };
}

function parseQueueMarketplace(
  data: Record<string, unknown> | null | undefined,
): SwipeQueueMarketplaceState {
  if (!data) return emptySwipeQueueMarketplaceState();
  const waitingUserId =
    typeof data.waitingUserId === 'string' && data.waitingUserId.trim()
      ? data.waitingUserId.trim()
      : null;
  const waitingUserFirstName =
    typeof data.waitingUserFirstName === 'string' &&
    data.waitingUserFirstName.trim()
      ? data.waitingUserFirstName.trim()
      : null;
  const activeMatchId =
    typeof data.activeMatchId === 'string' && data.activeMatchId.trim()
      ? data.activeMatchId.trim()
      : null;
  const rawStatus =
    typeof data.marketplaceStatus === 'string'
      ? data.marketplaceStatus.trim()
      : '';
  const marketplaceStatus =
    rawStatus === 'available' ||
    rawStatus === 'waiting_for_member' ||
    rawStatus === 'matched' ||
    rawStatus === 'ready' ||
    rawStatus === 'cancelled_by_admin'
      ? rawStatus
      : null;
  const waitingSinceMs =
    safeToMillis(data.waitingSince) ??
    (waitingUserId ? safeToMillis(data.updatedAt) : null);
  return {
    waitingUserId,
    waitingUserFirstName,
    waitingSinceMs,
    activeMatchId,
    marketplaceStatus,
  };
}

/** Live `matchQueues/{1..10}` for Swipe seat / match status. */
export function subscribeSwipeMatchQueues(
  onData: (queues: Record<string, SwipeQueueMarketplaceState>) => void,
): Unsubscribe {
  const state: Record<string, SwipeQueueMarketplaceState> = {};
  for (const id of ADMIN_FOOD_CARD_SLOT_IDS) {
    state[id] = emptySwipeQueueMarketplaceState();
  }
  const emit = () => onData({ ...state });
  const unsubs = ADMIN_FOOD_CARD_SLOT_IDS.map((slotId) =>
    onSnapshot(
      doc(db, 'matchQueues', slotId),
      (snap) => {
        state[slotId] = parseQueueMarketplace(
          snap.exists() ? (snap.data() as Record<string, unknown>) : null,
        );
        emit();
      },
      () => {
        state[slotId] = emptySwipeQueueMarketplaceState();
        emit();
      },
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Nearly-complete (1/2) seats first, then slot id. */
export function sortSwipeCardsByMarketplacePriority(
  cards: SwipeFoodCard[],
): SwipeFoodCard[] {
  return [...cards].sort((a, b) => {
    const aWait = a.marketplaceStatus === 'waiting_for_member' ? 0 : 1;
    const bWait = b.marketplaceStatus === 'waiting_for_member' ? 0 : 1;
    if (aWait !== bWait) return aWait - bWait;
    const ai = Number.parseInt(a.adminFoodShareId, 10);
    const bi = Number.parseInt(b.adminFoodShareId, 10);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return a.adminFoodShareId.localeCompare(b.adminFoodShareId);
  });
}

function sortSlotIds(rows: AdminFoodShareDoc[]): AdminFoodShareDoc[] {
  return [...rows].sort((a, b) => {
    const ai = Number.parseInt(a.id, 10);
    const bi = Number.parseInt(b.id, 10);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

/** Count `active` rows from an `adminFoodShares` slot snapshot. */
export function countActiveAdminFoodSharesInSnapshot(
  snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> },
): number {
  let n = 0;
  for (const d of snap.docs) {
    const mapped = mapAdminFoodShareDoc(d.id, d.data() as Record<string, unknown>);
    if (mapped.active) n += 1;
  }
  return n;
}

/** Live swipe deck — `adminFoodShares` where `active == true` (rules-safe for role `user`). */
export function subscribeActiveAdminFoodShares(
  onData: (shares: AdminFoodShareDoc[]) => void,
): Unsubscribe {
  const collectionPath = 'adminFoodShares';
  const queryDescription =
    "collection('adminFoodShares').where('active', '==', true).limit(10)";
  console.log('[SHARE QUERY]', {
    collectionPath,
    queryDescription,
  });
  console.log('[SWIPE COLLECTION]', collectionPath);
  console.log('[SWIPE QUERY]', queryDescription);

  const q = query(
    collection(db, collectionPath),
    where('active', '==', true),
    limit(DECK_LIMIT),
  );

  let rows: AdminFoodShareDoc[] = [];
  let boundaryTimer: ReturnType<typeof setTimeout> | null = null;

  const emitLiveRows = () => {
    if (boundaryTimer) {
      clearTimeout(boundaryTimer);
      boundaryTimer = null;
    }
    const now = Date.now();
    onData(rows.filter((row) => isAdminFoodShareLive(row, now)));
    const delay = nextAvailabilityBoundaryDelay(rows, now);
    if (delay != null) {
      boundaryTimer = setTimeout(emitLiveRows, delay);
    }
  };

  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      rows = sortSlotIds(
        snap.docs.map((d) =>
          mapAdminFoodShareDoc(d.id, d.data() as Record<string, unknown>),
        ),
      );
      console.log('[SWIPE QUERY RESULT]', {
        collectionPath,
        queryDescription,
        docCount: snap.docs.length,
        activeIds: rows.map((r) => r.id),
        rows,
      });
      emitLiveRows();
    },
    (err) => {
      rows = [];
      if (boundaryTimer) {
        clearTimeout(boundaryTimer);
        boundaryTimer = null;
      }
      console.error('[SWIPE QUERY RESULT] listener error', {
        collectionPath,
        queryDescription,
        code: (err as { code?: string }).code,
        message: err instanceof Error ? err.message : String(err),
      });
      onData([]);
    },
  );
  return () => {
    unsubscribe();
    if (boundaryTimer) clearTimeout(boundaryTimer);
  };
}

/** Admin panel — all 10 fixed slots (active or not). */
export function subscribeAdminFoodShareSlots(
  onData: (rows: AdminFoodShareDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'adminFoodShares'),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((d) => byId.set(d.id, d.data() as Record<string, unknown>));
      const rows = ADMIN_FOOD_CARD_SLOT_IDS.map((sid) =>
        mapAdminFoodShareDoc(sid, byId.get(sid) ?? {}),
      );
      onData(rows);
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load admin shares'));
      onData(
        ADMIN_FOOD_CARD_SLOT_IDS.map((sid) => mapAdminFoodShareDoc(sid, {})),
      );
    },
  );
}

export function adminFoodSharesToSwipeCards(
  shares: AdminFoodShareDoc[],
  queues?: Record<string, SwipeQueueMarketplaceState>,
): SwipeFoodCard[] {
  const now = Date.now();
  const cards = shares
    .filter((share) => isAdminFoodShareLive(share, now))
    .map((share) =>
      adminFoodShareToSwipeCard(share, queues?.[share.id] ?? null),
    );
  return sortSwipeCardsByMarketplacePriority(cards);
}

export type { AdminFoodCardSlotId };
