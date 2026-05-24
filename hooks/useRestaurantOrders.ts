import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  isRestaurantOrderArchived,
  matchesRestaurantOrderFilter,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import {
  archiveOrderForRestaurant,
  hideOrderForRestaurant,
  restoreOrderForRestaurant,
} from '@/services/orderArchiveService';
import {
  resetRestaurantOrderCleanupState,
  scheduleRestaurantOrderCleanup,
} from '@/services/orderCleanupService';
import { getOrders, type RestaurantOrder } from '@/services/orderService';

export type RestaurantOrdersOptimisticMap = Record<
  string,
  'hide' | 'archive' | 'restore'
>;

export type UseRestaurantOrdersOptions = {
  restaurantId: string | null | undefined;
  restaurantTimeZone?: string | null;
  filter?: RestaurantOrderListFilter;
  /** When false, skips background retention cleanup (e.g. archived tab). */
  enableAutoCleanup?: boolean;
};

export function useRestaurantOrders(options: UseRestaurantOrdersOptions) {
  const {
    restaurantId,
    restaurantTimeZone,
    filter = 'active',
    enableAutoCleanup = true,
  } = options;

  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<RestaurantOrdersOptimisticMap>({});

  const lastCleanupScheduleKeyRef = useRef<string>('');

  const timeZone =
    typeof restaurantTimeZone === 'string' && restaurantTimeZone.trim()
      ? restaurantTimeZone.trim()
      : undefined;

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      setOptimistic({});
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = getOrders(
      restaurantId,
      (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setOrders(list);
        setLoading(false);
        setError(null);

        if (!enableAutoCleanup || filter === 'archived') return;

        const scheduleKey = `${restaurantId}:${list.length}:${list[0]?.id ?? ''}`;
        if (lastCleanupScheduleKeyRef.current === scheduleKey) return;
        lastCleanupScheduleKeyRef.current = scheduleKey;
        scheduleRestaurantOrderCleanup(restaurantId, list);
      },
      { timeZone },
    );

    return () => {
      unsub();
      resetRestaurantOrderCleanupState(restaurantId);
      lastCleanupScheduleKeyRef.current = '';
    };
  }, [restaurantId, timeZone, enableAutoCleanup, filter]);

  const clearOptimistic = useCallback((orderId: string) => {
    setOptimistic((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  const applyOptimistic = useCallback(
    (orderId: string, action: RestaurantOrdersOptimisticMap[string]) => {
      setOptimistic((prev) => ({ ...prev, [orderId]: action }));
    },
    [],
  );

  const visibleOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const pending = optimistic[order.id];
        if (pending === 'restore') {
          return matchesRestaurantOrderFilter(order, filter);
        }
        if (pending === 'hide' || pending === 'archive') {
          return filter === 'archived';
        }
        if (filter === 'archived') {
          return isRestaurantOrderArchived(order);
        }
        if (isRestaurantOrderArchived(order)) return false;
        return matchesRestaurantOrderFilter(order, filter);
      })
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  }, [orders, optimistic, filter]);

  useEffect(() => {
    if (!orders.length) return;
    setOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const order = orders.find((o) => o.id === id);
        if (!order) continue;
        const action = next[id];
        if (action === 'hide' || action === 'archive') {
          if (isRestaurantOrderArchived(order)) {
            delete next[id];
            changed = true;
          }
        }
        if (action === 'restore' && !isRestaurantOrderArchived(order)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [orders]);

  const archiveOrder = useCallback(
    async (orderId: string) => {
      applyOptimistic(orderId, 'archive');
      try {
        await archiveOrderForRestaurant(orderId);
      } catch (e) {
        clearOptimistic(orderId);
        throw e;
      }
    },
    [applyOptimistic, clearOptimistic],
  );

  const hideOrder = useCallback(
    async (orderId: string) => {
      applyOptimistic(orderId, 'hide');
      try {
        await hideOrderForRestaurant(orderId);
      } catch (e) {
        clearOptimistic(orderId);
        throw e;
      }
    },
    [applyOptimistic, clearOptimistic],
  );

  const restoreOrder = useCallback(
    async (orderId: string) => {
      applyOptimistic(orderId, 'restore');
      try {
        await restoreOrderForRestaurant(orderId);
      } catch (e) {
        clearOptimistic(orderId);
        throw e;
      }
    },
    [applyOptimistic, clearOptimistic],
  );

  return useMemo(
    () => ({
      orders: visibleOrders,
      allOrders: orders,
      loading,
      error,
      timeZone,
      archiveOrder,
      hideOrder,
      restoreOrder,
      clearOptimistic,
    }),
    [
      visibleOrders,
      orders,
      loading,
      error,
      timeZone,
      archiveOrder,
      hideOrder,
      restoreOrder,
      clearOptimistic,
    ],
  );
}
