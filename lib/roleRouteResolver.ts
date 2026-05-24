/**
 * @deprecated Prefer `@/lib/routing/routePaths` and `@/lib/routing/routeMaps`.
 */
export type { RoleHomeRoute } from '@/lib/routing/routePaths';
export { roleRouteResolver, roleDefaultPath } from '@/lib/routing/routePaths';
export {
  expectedRouteGroupForRole,
  isRoleAllowedInRouteGroup,
  isRoleRouteGroupViolation,
  isInsideRoleHomeShell,
  isCustomerTabsRole,
  isTabsPathForWrongRole,
  resolveReturnPathForRole,
  roleTermsReturnPath,
} from '@/lib/routing/roleReturnPaths';
