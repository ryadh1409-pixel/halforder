import { useRestaurantOrdersFeed } from '@/hooks/useRestaurantOrdersFeed';
import type { RestaurantOrdersFeed } from '@/hooks/useRestaurantOrdersFeed';
import type { RestaurantOrderListFilter } from '@/constants/restaurantOrderFilters';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type OrdersMode = 'active' | 'history';

type HostRestaurantOrdersContextValue = RestaurantOrdersFeed & {
  mode: OrdersMode;
  filter: RestaurantOrderListFilter;
  setMode: (mode: OrdersMode) => void;
  setFilter: (filter: RestaurantOrderListFilter) => void;
};

const HostRestaurantOrdersContext =
  createContext<HostRestaurantOrdersContextValue | null>(null);

/**
 * Single live kitchen feed for the restaurant host shell.
 * Dashboard + Orders tabs both read this — never subscribe twice.
 */
export function HostRestaurantOrdersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const restaurantId = user?.uid?.trim() || null;
  const [restaurantTimeZone, setRestaurantTimeZone] = useState<string | null>(
    null,
  );
  const [mode, setModeState] = useState<OrdersMode>('active');
  const [filter, setFilterState] = useState<RestaurantOrderListFilter>('new');

  useEffect(() => {
    if (!restaurantId) {
      setRestaurantTimeZone(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'restaurants', restaurantId),
      (snap) => {
        const data = snap.data() as
          | { timezone?: unknown; timeZone?: unknown }
          | undefined;
        const tz =
          typeof data?.timezone === 'string' && data.timezone.trim()
            ? data.timezone.trim()
            : typeof data?.timeZone === 'string' && data.timeZone.trim()
              ? data.timeZone.trim()
              : null;
        setRestaurantTimeZone(tz);
      },
      () => setRestaurantTimeZone(null),
    );
  }, [restaurantId]);

  const feed = useRestaurantOrdersFeed({
    restaurantId,
    restaurantTimeZone,
    // Match prior RestaurantOrdersPanel default — no per-tab cleanup races.
    enableAutoCleanup: false,
  });

  const setMode = useCallback((next: OrdersMode) => {
    setModeState(next);
  }, []);

  const setFilter = useCallback((next: RestaurantOrderListFilter) => {
    setFilterState(next);
  }, []);

  const value = useMemo(
    (): HostRestaurantOrdersContextValue => ({
      ...feed,
      mode,
      filter,
      setMode,
      setFilter,
    }),
    [feed, mode, filter, setMode, setFilter],
  );

  return (
    <HostRestaurantOrdersContext.Provider value={value}>
      {children}
    </HostRestaurantOrdersContext.Provider>
  );
}

export function useHostRestaurantOrdersFeed(): RestaurantOrdersFeed | null {
  const ctx = useContext(HostRestaurantOrdersContext);
  if (!ctx) return null;
  return {
    restaurantId: ctx.restaurantId,
    activeOrders: ctx.activeOrders,
    archivedOrders: ctx.archivedOrders,
    orders: ctx.orders,
    loading: ctx.loading,
    error: ctx.error,
    timeZone: ctx.timeZone,
  };
}

export function useHostRestaurantOrdersUi(): {
  mode: OrdersMode;
  filter: RestaurantOrderListFilter;
  setMode: (mode: OrdersMode) => void;
  setFilter: (filter: RestaurantOrderListFilter) => void;
} | null {
  const ctx = useContext(HostRestaurantOrdersContext);
  if (!ctx) return null;
  return {
    mode: ctx.mode,
    filter: ctx.filter,
    setMode: ctx.setMode,
    setFilter: ctx.setFilter,
  };
}
