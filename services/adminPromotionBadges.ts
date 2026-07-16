import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import {
  parsePromotionBadge,
  promotionBadgeLabel,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import { auth, db } from '@/services/firebase';
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type PromotionBadgeTargetKind =
  | 'restaurant'
  | 'foodShare'
  | 'menuItem';

/** One row in the Admin Promotion Badges list. */
export type PromotionBadgeTarget = {
  key: string;
  kind: PromotionBadgeTargetKind;
  id: string;
  /** Required when kind === 'menuItem' (parent restaurant id). */
  restaurantId?: string;
  restaurantName: string;
  foodName: string;
  promotionBadge: PromotionBadgeValue;
};

function badgeFromData(data: Record<string, unknown>): PromotionBadgeValue {
  return parsePromotionBadge(data.promotionBadge);
}

function mapRestaurant(
  id: string,
  data: Record<string, unknown>,
): PromotionBadgeTarget {
  const restaurantName =
    (typeof data.name === 'string' && data.name.trim()) ||
    (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
    'Restaurant';
  const foodName =
    (typeof data.featuredItem === 'string' && data.featuredItem.trim()) ||
    (typeof data.cuisine === 'string' && data.cuisine.trim()) ||
    (typeof data.type === 'string' && data.type.trim()) ||
    'Restaurant card';
  return {
    key: `restaurant:${id}`,
    kind: 'restaurant',
    id,
    restaurantName,
    foodName,
    promotionBadge: badgeFromData(data),
  };
}

function mapFoodShare(
  id: AdminFoodCardSlotId,
  data: Record<string, unknown> | undefined,
): PromotionBadgeTarget {
  const restaurantName =
    (typeof data?.restaurantName === 'string' && data.restaurantName.trim()) ||
    'HalfOrder';
  const foodName =
    (typeof data?.foodName === 'string' && data.foodName.trim()) ||
    (typeof data?.title === 'string' && data.title.trim()) ||
    `Food card ${id}`;
  return {
    key: `foodShare:${id}`,
    kind: 'foodShare',
    id,
    restaurantName,
    foodName,
    promotionBadge: data ? badgeFromData(data) : 'none',
  };
}

function mapMenuItem(
  restaurantId: string,
  restaurantName: string,
  itemId: string,
  data: Record<string, unknown>,
): PromotionBadgeTarget {
  const foodName =
    (typeof data.name === 'string' && data.name.trim()) || 'Menu item';
  return {
    key: `menuItem:${restaurantId}:${itemId}`,
    kind: 'menuItem',
    id: itemId,
    restaurantId,
    restaurantName,
    foodName,
    promotionBadge: badgeFromData(data),
  };
}

function sortTargets(rows: PromotionBadgeTarget[]): PromotionBadgeTarget[] {
  return [...rows].sort((a, b) => {
    const byRestaurant = a.restaurantName.localeCompare(b.restaurantName);
    if (byRestaurant !== 0) return byRestaurant;
    return a.foodName.localeCompare(b.foodName);
  });
}

/**
 * Live list of restaurants + admin food-share slots + menu items.
 */
export function subscribePromotionBadgeTargets(
  onData: (rows: PromotionBadgeTarget[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let restaurants: PromotionBadgeTarget[] = [];
  let foodShares: PromotionBadgeTarget[] = ADMIN_FOOD_CARD_SLOT_IDS.map((id) =>
    mapFoodShare(id, undefined),
  );
  let menuItems: PromotionBadgeTarget[] = [];
  const restaurantNames = new Map<string, string>();
  const menuUnsubs = new Map<string, Unsubscribe>();

  const emit = () => {
    onData(sortTargets([...foodShares, ...restaurants, ...menuItems]));
  };

  const rebuildMenuItems = () => {
    const next: PromotionBadgeTarget[] = [];
    menuItemBuckets.forEach((rows) => next.push(...rows));
    menuItems = next;
    emit();
  };

  const menuItemBuckets = new Map<string, PromotionBadgeTarget[]>();

  const syncMenuListeners = (restaurantIds: string[]) => {
    const keep = new Set(restaurantIds);
    for (const [rid, unsub] of menuUnsubs) {
      if (!keep.has(rid)) {
        unsub();
        menuUnsubs.delete(rid);
        menuItemBuckets.delete(rid);
      }
    }
    for (const rid of restaurantIds) {
      if (menuUnsubs.has(rid)) continue;
      const unsub = onSnapshot(
        collection(db, 'restaurants', rid, 'menuItems'),
        (snap) => {
          const name = restaurantNames.get(rid) ?? 'Restaurant';
          menuItemBuckets.set(
            rid,
            snap.docs.map((d) =>
              mapMenuItem(
                rid,
                name,
                d.id,
                d.data() as Record<string, unknown>,
              ),
            ),
          );
          rebuildMenuItems();
        },
        (e) => {
          onError?.(
            e instanceof Error ? e : new Error('Failed to load menu items'),
          );
        },
      );
      menuUnsubs.set(rid, unsub);
    }
    rebuildMenuItems();
  };

  const unsubRestaurants = onSnapshot(
    collection(db, 'restaurants'),
    (snap) => {
      restaurants = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const row = mapRestaurant(d.id, data);
        restaurantNames.set(d.id, row.restaurantName);
        return row;
      });
      // Keep menu-item restaurant labels in sync when names change.
      for (const [rid, rows] of menuItemBuckets) {
        const name = restaurantNames.get(rid) ?? 'Restaurant';
        menuItemBuckets.set(
          rid,
          rows.map((r) => ({ ...r, restaurantName: name })),
        );
      }
      syncMenuListeners(snap.docs.map((d) => d.id));
      emit();
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load restaurants'));
    },
  );

  const unsubFoodShares = onSnapshot(
    query(
      collection(db, 'adminFoodShares'),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((d) =>
        byId.set(d.id, d.data() as Record<string, unknown>),
      );
      foodShares = ADMIN_FOOD_CARD_SLOT_IDS.map((id) =>
        mapFoodShare(id, byId.get(id)),
      );
      emit();
    },
    (e) => {
      onError?.(
        e instanceof Error ? e : new Error('Failed to load food cards'),
      );
    },
  );

  return () => {
    unsubRestaurants();
    unsubFoodShares();
    menuUnsubs.forEach((u) => u());
    menuUnsubs.clear();
  };
}

function normalizeBadge(
  value: PromotionBadgeValue | string | null | undefined,
): PromotionBadgeValue {
  const parsed = parsePromotionBadge(value);
  return parsed === 'most_ordered' || parsed === 'great_price'
    ? parsed
    : 'none';
}

/** Persist badge on a restaurant doc only. */
export async function saveRestaurantPromotionBadge(
  restaurantId: string,
  promotionBadge: PromotionBadgeValue,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const id = restaurantId.trim();
  if (!id) throw new Error('Restaurant id required');

  await updateDoc(doc(db, 'restaurants', id), {
    promotionBadge: normalizeBadge(promotionBadge),
    updatedAt: serverTimestamp(),
  });
}

/** Persist badge on an admin food-share slot only. */
export async function saveFoodSharePromotionBadge(
  slotDocId: AdminFoodCardSlotId,
  promotionBadge: PromotionBadgeValue,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');

  await updateDoc(doc(db, 'adminFoodShares', slotDocId), {
    promotionBadge: normalizeBadge(promotionBadge),
    updatedAt: serverTimestamp(),
  });
}

/** Persist badge on a single menu item only. */
export async function saveMenuItemPromotionBadge(
  restaurantId: string,
  itemId: string,
  promotionBadge: PromotionBadgeValue,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const rid = restaurantId.trim();
  const iid = itemId.trim();
  if (!rid) throw new Error('Restaurant id required');
  if (!iid) throw new Error('Menu item id required');

  await updateDoc(doc(db, 'restaurants', rid, 'menuItems', iid), {
    promotionBadge: normalizeBadge(promotionBadge),
    updatedAt: serverTimestamp(),
  });
}

export async function savePromotionBadgeTarget(
  target: Pick<PromotionBadgeTarget, 'kind' | 'id' | 'restaurantId'>,
  promotionBadge: PromotionBadgeValue,
): Promise<void> {
  if (target.kind === 'restaurant') {
    await saveRestaurantPromotionBadge(target.id, promotionBadge);
    return;
  }
  if (target.kind === 'menuItem') {
    const rid = target.restaurantId?.trim() ?? '';
    if (!rid) throw new Error('Restaurant id required');
    await saveMenuItemPromotionBadge(rid, target.id, promotionBadge);
    return;
  }
  await saveFoodSharePromotionBadge(
    target.id as AdminFoodCardSlotId,
    promotionBadge,
  );
}

export function formatPromotionBadgeCurrent(
  value: PromotionBadgeValue,
): string {
  return promotionBadgeLabel(value) ?? 'None';
}

export function isRestaurantPromotionTarget(
  target: PromotionBadgeTarget,
): boolean {
  return target.kind === 'restaurant' || target.kind === 'foodShare';
}

export function isMenuItemPromotionTarget(
  target: PromotionBadgeTarget,
): boolean {
  return target.kind === 'menuItem';
}
