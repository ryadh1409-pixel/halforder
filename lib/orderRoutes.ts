import type { Href } from 'expo-router';

import { adminRoutes } from '@/constants/adminRoutes';
import { normalizeRoleForRouting } from '@/lib/authRole';
import { DRIVER_ROUTES, HOST_ROUTES, USER_ROUTES } from '@/lib/navigationPaths';
import type { UserRole } from '@/services/userService';

/** Role-scoped marketplace order detail — never use ambiguous `/order/[id]` from shell UIs. */
export function orderDetailHref(role: UserRole | null | undefined, orderId: string): Href {
  const id = orderId.trim();
  if (!id) return USER_ROUTES.hub as Href;

  switch (normalizeRoleForRouting(role)) {
    case 'driver':
      return DRIVER_ROUTES.order(id) as Href;
    case 'restaurant':
      return HOST_ROUTES.order(id) as Href;
    case 'admin':
      return adminRoutes.order(id) as Href;
    case 'user':
    default:
      return USER_ROUTES.order(id) as Href;
  }
}
