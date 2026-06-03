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
import { applyStageLockToOrder } from '@/lib/orderStageLock';
import { areRestaurantOrderListsEqual } from '@/lib/restaurantOrderListDedup';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import {
  resetRestaurantOrderCleanupState,
  scheduleRestaurantOrderCleanup,
} from '@/services/orderCleanupService';
import {
  subscribeActiveRestaurantOrders,
  type RestaurantOrder,
} from '@/services/orderService';

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

function normField(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

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
  const [kitchenOptimistic, setKitchenOptimistic] = useState<
    Record<string, Partial<RestaurantOrder>>
  >({});

  const lastCleanupScheduleKeyRef = useRef<string>('');

  const timeZone =
    typeof restaurantTimeZone === 'string' && restaurantTimeZone.trim()
      ? restaurantTimeZone.trim()
      : undefined;

  const mergeKitchenOptimistic = useCallback(
    (order: RestaurantOrder): RestaurantOrder => {
      const patch = kitchenOptimistic[order.id];
      const merged = patch ? { ...order, ...patch } : order;
      return applyStageLockToOrder(merged);
    },
    [kitchenOptimistic],
  );

  const applyKitchenOptimistic = useCallback(
    (orderId: string, patch: Partial<RestaurantOrder>) => {
      setKitchenOptimistic((prev) => ({
        ...prev,
        [orderId]: { ...(prev[orderId] ?? {}), ...patch },
      }));
    },
    [],
  );

  const clearKitchenOptimistic = useCallback((orderId: string) => {
    setKitchenOptimistic((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!restaurantId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      setOptimistic({});
      setKitchenOptimistic({});
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeActiveRestaurantOrders(
      restaurantId,
      (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setOrders((prev) =>
          areRestaurantOrderListsEqual(prev, list) ? prev : list,
        );
        setLoading(false);
        setError(null);

        if (!enableAutoCleanup) return;

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
  }, [restaurantId, timeZone, enableAutoCleanup]);

  useEffect(() => {
    if (!orders.length) return;
    setKitchenOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const order = orders.find((o) => o.id === id);
        const patch = next[id];
        if (!order || !patch) continue;
        const statusMatch =
          patch.status === undefined ||
          normField(order.status) === normField(patch.status);
        const deliveryMatch =
          patch.deliveryStatus === undefined ||
          normField(order.deliveryStatus) === normField(patch.deliveryStatus);
        if (statusMatch && deliveryMatch) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [orders]);

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

  const displayOrders = useMemo(
    () => orders.map(mergeKitchenOptimistic),
    [orders, mergeKitchenOptimistic],
  );

  const visibleOrders = useMemo(() => {
    return displayOrders
      .filter((order) => isOrderFresh(order))
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
  }, [displayOrders, optimistic, filter]);

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
      allOrders: displayOrders,
      loading,
      error,
      timeZone,
      archiveOrder,
      hideOrder,
      restoreOrder,
      clearOptimistic,
      applyKitchenOptimistic,
      clearKitchenOptimistic,
    }),
    [
      visibleOrders,
      displayOrders,
      loading,
      error,
      timeZone,
      archiveOrder,
      hideOrder,
      restoreOrder,
      clearOptimistic,
      applyKitchenOptimistic,
      clearKitchenOptimistic,
    ],
  );
}
