import { JOIN_DISCOVERY_ORDER_STATUSES } from '@/constants/joinDiscovery';
import { GROWTH_ORDER_SCAN_LIMIT } from '@/constants/growth';
import { collection, limit, query, where } from 'firebase/firestore';

import { db } from './firebase';
import { FIRESTORE_COLLECTIONS } from './firestorePaths';

/** Set `EXPO_PUBLIC_MATCHABLE_QUERY_PROBE=1` to run `limit(5)` only (no `where`) — isolates rules/path vs composite index / `status` field. */
export function isJoinDirectoryProbeMode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.env.EXPO_PUBLIC_MATCHABLE_QUERY_PROBE === '1'
  );
}

/** Status list for join-directory queries (must match rules + Cloud Function). */
export const JOIN_DIRECTORY_STATUS_VALUES = [...JOIN_DISCOVERY_ORDER_STATUSES];

/**
 * Denormalized row in `public_matchable_orders` (safe fields only; written by Cloud Functions).
 * Document id equals `orders` document id.
 */
export type PublicMatchableOrderDoc = {
  orderId?: string;
  status?: string;
  foodName?: string;
  restaurantName?: string;
  mealType?: string | null;
  itemsSummary?: string | null;
  foodType?: string | null;
  /** Safe HTTPS image URL for listing cards (no private media). */
  restaurantImageUrl?: string | null;
  etaMinutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  tags?: string[];
  slotsOpen?: number;
  maxSlots?: number;
  expiresAt?: number | null;
  priceHint?: string | number | null;
  hostUserId?: string | null;
  /** UIDs already on the order — hide from viewer if they are in this list. */
  memberIds?: string[];
  /** Mirror of source `orders` created time (for indexes / ordering). */
  createdAt?: unknown;
  updatedAt?: unknown;
};

/**
 * AI / smart-match directory query (`public_matchable_orders`).
 * Deploy `firestore.indexes.json` and rules; sync writes via `syncPublicMatchableOrder`.
 *
 * **Probe:** `EXPO_PUBLIC_MATCHABLE_QUERY_PROBE=1` → `query(collection, limit(5))` only (no `where`).
 * If probe succeeds but the default query fails with `failed-precondition`, add/fix the composite index
 * or ensure every directory doc has a `status` value in `JOIN_DIRECTORY_STATUS_VALUES`.
 */
export function joinDirectoryOrdersQuery(scanLimit: number = GROWTH_ORDER_SCAN_LIMIT) {
  const col = collection(db, FIRESTORE_COLLECTIONS.publicMatchableOrders);
  if (isJoinDirectoryProbeMode()) {
    return query(col, limit(5));
  }
  return query(
    col,
    where('status', 'in', JOIN_DIRECTORY_STATUS_VALUES),
    limit(scanLimit),
  );
}
