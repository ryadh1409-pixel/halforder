import { HOST_ROUTES } from '@/lib/navigationPaths';

/** Expo Router — restaurant host shell (not `(tabs)`). */
export const hostRoutes = {
  dashboard: HOST_ROUTES.dashboard,
  menu: HOST_ROUTES.menu,
  orders: HOST_ROUTES.orders,
} as const;
