import { HOST_ROUTES } from '@/lib/navigationPaths';

/** Expo Router — restaurant host shell (not `(tabs)`). */
export const hostRoutes = {
  dashboard: HOST_ROUTES.dashboard,
  orders: HOST_ROUTES.orders,
  menu: HOST_ROUTES.menu,
  wallet: HOST_ROUTES.wallet,
} as const;
