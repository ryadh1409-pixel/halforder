import { db } from '@/services/firebase';
import {
  collection,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type Query,
} from 'firebase/firestore';

export {
  ACTIVE_RESTAURANT_DERIVED_STAGES,
  isActiveRestaurantDerivedStage,
  isActiveRestaurantOrder,
  isRestaurantDashboardOrder,
  type RestaurantOrderArchiveFields,
} from '@/lib/restaurantActiveOrders';

/** Restaurant dashboard visibility window — 24 hours. */
const RESTAURANT_ORDER_FRESH_MS = 24 * 60 * 60 * 1000;

/** Max documents for the live restaurant kitchen listener (24h window). */
export const RESTAURANT_ACTIVE_ORDERS_LIMIT = 48;

/** Lookback for archived terminal orders (older than 24h). */
export const RESTAURANT_ARCHIVED_ORDERS_LIMIT = 32;

/**
 * Firestore query for the restaurant live dashboard: same venue, last 24h only.
 * Terminal statuses are excluded in {@link isActiveRestaurantOrder} (no broad status scan).
 */
export function getActiveRestaurantOrdersQuery(restaurantId: string): Query {
  const id = restaurantId.trim();
  const freshAfter = Timestamp.fromMillis(Date.now() - RESTAURANT_ORDER_FRESH_MS);
  return query(
    collection(db, 'orders'),
    where('restaurantId', '==', id),
    where('createdAt', '>=', freshAfter),
    orderBy('createdAt', 'desc'),
    limit(RESTAURANT_ACTIVE_ORDERS_LIMIT),
  );
}

/** Terminal orders older than 24h — merged client-side for Archived tab. */
export function getRestaurantArchivedOrdersQuery(restaurantId: string): Query {
  const id = restaurantId.trim();
  const freshAfter = Timestamp.fromMillis(Date.now() - RESTAURANT_ORDER_FRESH_MS);
  return query(
    collection(db, 'orders'),
    where('restaurantId', '==', id),
    where('createdAt', '<', freshAfter),
    orderBy('createdAt', 'desc'),
    limit(RESTAURANT_ARCHIVED_ORDERS_LIMIT),
  );
}
