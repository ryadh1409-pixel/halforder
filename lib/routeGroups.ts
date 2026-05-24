/**
 * @deprecated Import from `@/lib/routing/routeConstants` and `@/lib/routing/routeMaps`.
 * Re-export shim for backward compatibility — no auth imports.
 */
export type { RouteGroup } from '@/lib/routing/routeConstants';
export {
  getRouteGroup,
  isInDriverGroup,
  isInHostGroup,
  isInTabsGroup,
  isInUserGroup,
} from '@/lib/routing/routeConstants';
export {
  expectedGroupForRole,
  isInsideCorrectRoleShell,
  isWrongGroupForRole,
} from '@/lib/routing/routeMaps';
