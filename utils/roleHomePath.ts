import { roleRouteResolver } from '@/lib/routing/routePaths';

/**
 * @deprecated Use {@link roleRouteResolver} or {@link roleDefaultPath} for role-aware navigation.
 */
export const APP_ROOT = roleRouteResolver('user');
