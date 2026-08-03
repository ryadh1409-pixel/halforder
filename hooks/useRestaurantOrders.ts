import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  isRestaurantOrderArchived,
  matchesRestaurantOrderFilter,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import { useHostRestaurantOrdersFeed } from '@/contexts/HostRestaurantOrdersContext';
import {
  useRestaurantOrdersFeed,
  type RestaurantOrdersFeed,
} from '@/hooks/useRestaurantOrdersFeed';
import { applyStageLockToOrder } from '@/lib/orderStageLock';
import {
  archiveOrderForRestaurant,
  hideOrderForRestaurant,
  restoreOrderForRestaurant,
} from '@/services/orderArchiveService';
import type { RestaurantOrder } from '@/services/orderService';

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

/**
 * Kitchen order list + optimistic UI on top of the shared (or local) feed.
 * Prefer {@link HostRestaurantOrdersProvider} so Dashboard and Orders share one listener.
 */
export function useRestaurantOrders(options: UseRestaurantOrdersOptions) {
  const {
    restaurantId: restaurantIdRaw,
    restaurantTimeZone,
    filter = 'new',
    enableAutoCleanup = true,
  } = options;
  const restaurantId = restaurantIdRaw?.trim() || null;

  const hostFeed = useHostRestaurantOrdersFeed();
  const canUseHostFeed =
    hostFeed != null &&
    restaurantId != null &&
    hostFeed.restaurantId === restaurantId;

  const localFeed = useRestaurantOrdersFeed({
    restaurantId: canUseHostFeed ? null : restaurantId,
    restaurantTimeZone,
    enableAutoCleanup: canUseHostFeed ? false : enableAutoCleanup,
  });

  const feed: RestaurantOrdersFeed = canUseHostFeed ? hostFeed : localFeed;

  const [optimistic, setOptimistic] = useState<RestaurantOrdersOptimisticMap>(
    {},
  );
  const [kitchenOptimistic, setKitchenOptimistic] = useState<
    Record<string, Partial<RestaurantOrder>>
  >({});

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
    if (!feed.orders.length) return;
    setKitchenOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const order = feed.orders.find((o) => o.id === id);
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
  }, [feed.orders]);

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
    () => feed.orders.map(mergeKitchenOptimistic),
    [feed.orders, mergeKitchenOptimistic],
  );

  const visibleOrders = useMemo(() => {
    return displayOrders
      .filter((order) => {
        const pending = optimistic[order.id];
        if (pending === 'restore') {
          return matchesRestaurantOrderFilter(order, filter);
        }
        if (pending === 'hide' || pending === 'archive') {
          return filter === 'archived';
        }
        if (filter === 'archived') {
          return (
            isRestaurantOrderArchived(order) ||
            matchesRestaurantOrderFilter(order, filter)
          );
        }
        if (isRestaurantOrderArchived(order)) return false;
        return matchesRestaurantOrderFilter(order, filter);
      })
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  }, [displayOrders, optimistic, filter]);

  useEffect(() => {
    if (!feed.orders.length) return;
    setOptimistic((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const order = feed.orders.find((o) => o.id === id);
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
  }, [feed.orders]);

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
      loading: feed.loading,
      error: feed.error,
      timeZone: feed.timeZone,
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
      feed.loading,
      feed.error,
      feed.timeZone,
      archiveOrder,
      hideOrder,
      restoreOrder,
      clearOptimistic,
      applyKitchenOptimistic,
      clearKitchenOptimistic,
    ],
  );
}
