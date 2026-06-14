import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';
import type { Href } from 'expo-router';

/** Canonical driver stack — always use these hrefs (never `/profile`, `/dispatch`, etc.). */
export const DRIVER_ROUTES = {
  hub: '/(driver)',
  dispatch: '/(driver)/dispatch',
  earnings: '/(driver)/earnings',
  /** Driver profile tab — unique path (not `(tabs)/profile`). */
  profile: '/(driver)/driver-profile',
  accountSettings: '/(driver)/account-settings',
  /** @deprecated Use {@link DRIVER_ROUTES.profile} */
  driverProfile: '/(driver)/driver-profile',
  active: '/(driver)/active',
  activeOrder: (orderId: string) =>
    `/(driver)/active/${encodeURIComponent(orderId)}` as const,
  /** Same root route as customers — viewer role picks driver UI in OrderDetailScreen. */
  order: (orderId: string) => customerOrderDetailHref(orderId),
} as const;

export type DriverTabKey = 'index' | 'earnings' | 'driver-profile';

export const DRIVER_TAB_HREFS: Record<DriverTabKey, Href> = {
  index: DRIVER_ROUTES.hub,
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
  /** Canonical marketplace order detail — root `app/order/[id].tsx` only. */
  order: (orderId: string): Href => customerOrderDetailHref(orderId),
  trackOrder: (orderId: string) => `/track-order/${encodeURIComponent(orderId)}` as const,
  foodShareMatch: (matchId: string) =>
    `/food-share-match/${encodeURIComponent(matchId)}` as const,
  foodShare: (adminFoodShareId: string) =>
    `/food-share/${encodeURIComponent(adminFoodShareId)}` as const,
  foodSharePay: (matchId: string) =>
    `/food-share-pay/${encodeURIComponent(matchId)}` as const,
  foodShareWaiting: (adminFoodShareId: string) =>
    `/food-share-waiting/${encodeURIComponent(adminFoodShareId)}` as const,
  foodShareChat: (matchId: string) =>
    `/food-share-chat/${encodeURIComponent(matchId)}` as const,
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
} as const;

export type HostTabKey = 'dashboard' | 'menu';

export const HOST_TAB_HREFS: Record<HostTabKey, Href> = {
  dashboard: HOST_ROUTES.dashboard,
  menu: HOST_ROUTES.menu,
};
