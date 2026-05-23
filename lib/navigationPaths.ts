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

/** Canonical customer tab shell hrefs. */
export const TABS_ROUTES = {
  hub: '/(tabs)',
  profile: '/(tabs)/profile',
  orders: '/(tabs)/orders',
  cart: '/(tabs)/cart',
  swipe: '/(tabs)/swipe',
  explore: '/(tabs)/explore',
  search: '/(tabs)/search',
  driverEntry: '/(tabs)/driver',
  host: '/(tabs)/host',
  menu: '/(tabs)/menu',
  ai: '/(tabs)/ai',
} as const;
