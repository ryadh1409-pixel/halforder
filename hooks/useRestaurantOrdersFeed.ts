import { useEffect, useMemo, useRef, useState } from 'react';

import { areRestaurantOrderListsEqual } from '@/lib/restaurantOrderListDedup';
import {
  resetRestaurantOrderCleanupState,
  scheduleRestaurantOrderCleanup,
} from '@/services/orderCleanupService';
import {
  subscribeActiveRestaurantOrders,
  subscribeRestaurantArchivedOrders,
  type RestaurantOrder,
} from '@/services/orderService';

export type RestaurantOrdersFeed = {
  restaurantId: string | null;
  activeOrders: RestaurantOrder[];
  archivedOrders: RestaurantOrder[];
  /** Active + archived merged by id (active wins). */
  orders: RestaurantOrder[];
  loading: boolean;
  error: string | null;
  timeZone: string | undefined;
};

export type UseRestaurantOrdersFeedOptions = {
  restaurantId: string | null | undefined;
  restaurantTimeZone?: string | null;
  /** When false, skips background retention cleanup. */
  enableAutoCleanup?: boolean;
};

function mergeRestaurantOrderLists(
  active: RestaurantOrder[],
  archived: RestaurantOrder[],
): RestaurantOrder[] {
  const byId = new Map<string, RestaurantOrder>();
  for (const order of archived) byId.set(order.id, order);
  for (const order of active) byId.set(order.id, order);
  return Array.from(byId.values());
}

/**
 * Sole Firestore subscription for restaurant kitchen orders (active + archived).
 * Mount once per host shell — Dashboard and Orders must share this feed.
 */
export function useRestaurantOrdersFeed(
  options: UseRestaurantOrdersFeedOptions,
): RestaurantOrdersFeed {
  const {
    restaurantId: restaurantIdRaw,
    restaurantTimeZone,
    enableAutoCleanup = true,
  } = options;
  const restaurantId = restaurantIdRaw?.trim() || null;

  const [activeOrders, setActiveOrders] = useState<RestaurantOrder[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastCleanupScheduleKeyRef = useRef<string>('');

  const timeZone =
    typeof restaurantTimeZone === 'string' && restaurantTimeZone.trim()
      ? restaurantTimeZone.trim()
      : undefined;

  useEffect(() => {
    if (!restaurantId) {
      setActiveOrders([]);
      setArchivedOrders([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    let activeReady = false;
    let archivedReady = false;

    const maybeDoneLoading = () => {
      if (activeReady && archivedReady) setLoading(false);
    };

    const unsubActive = subscribeActiveRestaurantOrders(
      restaurantId,
      (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setActiveOrders((prev) =>
          areRestaurantOrderListsEqual(prev, list) ? prev : list,
        );
        activeReady = true;
        setError(null);
        maybeDoneLoading();

        if (!enableAutoCleanup) return;

        const scheduleKey = `${restaurantId}:${list.length}:${list[0]?.id ?? ''}`;
        if (lastCleanupScheduleKeyRef.current === scheduleKey) return;
        lastCleanupScheduleKeyRef.current = scheduleKey;
        scheduleRestaurantOrderCleanup(restaurantId, list);
      },
      { timeZone },
    );

    const unsubArchived = subscribeRestaurantArchivedOrders(
      restaurantId,
      (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setArchivedOrders((prev) =>
          areRestaurantOrderListsEqual(prev, list) ? prev : list,
        );
        archivedReady = true;
        maybeDoneLoading();
      },
      { timeZone },
    );

    return () => {
      unsubActive();
      unsubArchived();
      resetRestaurantOrderCleanupState(restaurantId);
      lastCleanupScheduleKeyRef.current = '';
    };
  }, [restaurantId, timeZone, enableAutoCleanup]);

  const orders = useMemo(
    () => mergeRestaurantOrderLists(activeOrders, archivedOrders),
    [activeOrders, archivedOrders],
  );

  return useMemo(
    () => ({
      restaurantId,
      activeOrders,
      archivedOrders,
      orders,
      loading,
      error,
      timeZone,
    }),
    [
      restaurantId,
      activeOrders,
      archivedOrders,
      orders,
      loading,
      error,
      timeZone,
    ],
  );
}
