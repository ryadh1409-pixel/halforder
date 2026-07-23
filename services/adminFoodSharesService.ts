import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { buildAdminShareCostBreakdown } from '@/lib/foodSharePricing';
import { parsePromotionBadge } from '@/lib/promotionBadge';
import { getHeroImageUrlForType, mockOrders } from '@/constants/mockSwipeFood';
import type { FoodOrderType } from '@/constants/mockSwipeFood';
import { db } from '@/services/firebase';
import type { AdminFoodShareDoc } from '@/types/foodShare';
import type { SwipeFoodCard } from '@/types/swipe';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
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
    deliveryShare: normNum(data.deliveryShare, normNum(data.deliveryCost, 0)),
    description: normStr(data.description, normStr(data.aiDescription)),
    active: normBool(data.active),
    createdAtMs: safeToMillis(data.createdAt),
    promotionBadge: parsePromotionBadge(data.promotionBadge),
  };
}

export function adminFoodShareToSwipeCard(share: AdminFoodShareDoc): SwipeFoodCard {
  const breakdown = buildAdminShareCostBreakdown(
    share.originalPrice,
    share.sharedPrice,
    share.deliveryShare,
  );
  const type = inferFoodType(share.foodName);

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
    totalPerUser: breakdown.totalPerUser,
    price: breakdown.totalPerUser,
    description: share.description,
    splitPriceLabel: `${breakdown.sharedPrice.toFixed(2)} food + ${breakdown.deliveryShare.toFixed(2)} delivery`,
    distance: 'Admin meal share',
    spotsLeft: 1,
    peopleJoined: 0,
    heroImageUri: share.image || getHeroImageUrlForType(type),
    orderStatus: null,
    deliveryStatus: null,
    lifecycle: 'WAITING_FOR_PARTNER',
    promotionBadge: share.promotionBadge,
  };
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

  return onSnapshot(
    q,
    (snap) => {
      const rows = sortSlotIds(
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
      onData(rows);
    },
    (err) => {
      console.error('[SWIPE QUERY RESULT] listener error', {
        collectionPath,
        queryDescription,
        code: (err as { code?: string }).code,
        message: err instanceof Error ? err.message : String(err),
      });
      onData([]);
    },
  );
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
): SwipeFoodCard[] {
  return shares.map(adminFoodShareToSwipeCard);
}

export type { AdminFoodCardSlotId };
