import type { Href } from 'expo-router';

/** Canonical driver stack — always use these hrefs (never `/profile`, `/dispatch`, etc.). */
export const DRIVER_ROUTES = {
  hub: '/(driver)',
  dispatch: '/(driver)/dispatch',
  earnings: '/(driver)/earnings',
  /** Driver profile tab — unique path (not `(tabs)/profile`). */
  profile: '/(driver)/driver-profile',
  /** @deprecated Use {@link DRIVER_ROUTES.profile} */
  driverProfile: '/(driver)/driver-profile',
  active: '/(driver)/active',
  activeOrder: (orderId: string) =>
    `/(driver)/active/${encodeURIComponent(orderId)}` as const,
  order: (orderId: string) => `/(driver)/order/${encodeURIComponent(orderId)}` as const,
} as const;

export type DriverTabKey = 'index' | 'dispatch' | 'earnings' | 'driver-profile';

export const DRIVER_TAB_HREFS: Record<DriverTabKey, Href> = {
  index: DRIVER_ROUTES.hub,
  dispatch: DRIVER_ROUTES.dispatch,
  earnings: DRIVER_ROUTES.earnings,
  'driver-profile': DRIVER_ROUTES.profile,
};

/**
 * Customer / user shell hrefs.
 * Route group is `(tabs)` today; use these helpers instead of ambiguous root paths.
 */
export const USER_ROUTES = {
  hub: '/(tabs)',
  orders: '/orders',
  order: (orderId: string) => `/order/${encodeURIComponent(orderId)}` as const,
} as const;

/** Canonical customer tab shell hrefs. */
export const TABS_ROUTES = {
  hub: '/(tabs)',
  profile: '/(tabs)/profile',
  cart: '/(tabs)/cart',
  swipe: '/(tabs)/swipe',
  explore: '/(tabs)/explore',
  search: '/(tabs)/search',
  driverEntry: '/(tabs)/driver',
  ai: '/(tabs)/ai',
} as const;

/** Restaurant / host operations — never under `(tabs)`. */
export const HOST_ROUTES = {
  hub: '/(host)',
  dashboard: '/(host)/dashboard',
  menu: '/(host)/menu',
  orders: '/(host)/orders',
  order: (orderId: string) => `/(host)/orders/${encodeURIComponent(orderId)}` as const,
} as const;

export type HostTabKey = 'dashboard' | 'orders' | 'menu';

export const HOST_TAB_HREFS: Record<HostTabKey, Href> = {
  dashboard: HOST_ROUTES.dashboard,
  orders: HOST_ROUTES.orders,
  menu: HOST_ROUTES.menu,
};
