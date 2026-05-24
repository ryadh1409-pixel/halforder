import type { Href } from 'expo-router';

import { DRIVER_ROUTES, HOST_ROUTES, TABS_ROUTES } from '@/lib/navigationPaths';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import type { UserRole } from '@/services/userService';

export type RoleHomeRoute =
  | '/(tabs)'
  | '/(host)'
  | '/(driver)'
  | '/(auth)/login'
  | '/(tabs)/admin';

/** Role → home route group (shell root). */
export function roleRouteResolver(role: UserRole | null | undefined): RoleHomeRoute {
  switch (normalizeRoleForRouting(role)) {
    case 'driver':
      return '/(driver)';
    case 'restaurant':
      return '/(host)';
    case 'admin':
      return '/(tabs)/admin';
    case 'user':
    default:
      return '/(tabs)';
  }
}

/** Role → default screen within shell. */
export function roleDefaultPath(role: UserRole | null | undefined): Href {
  switch (normalizeRoleForRouting(role)) {
    case 'driver':
      return DRIVER_ROUTES.hub as Href;
    case 'restaurant':
      return HOST_ROUTES.dashboard as Href;
    case 'admin':
      return '/(tabs)/admin' as Href;
    case 'user':
    default:
      return TABS_ROUTES.hub as Href;
  }
}
