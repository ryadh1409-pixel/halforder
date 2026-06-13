import { roleRouteResolver } from '@/lib/routing/routePaths';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import type { UserRole } from '@/services/userService';

export type { RoutingRole } from '@/lib/routing/roleTypes';
export { normalizeRoleForRouting } from '@/lib/routing/roleTypes';

/** Signup / upgrade intent from auth or profile flows. */
export type SignupIntent = 'user' | 'restaurant' | 'driver';

export type AuthRoleRoute =
  | '/'
  | '/(tabs)'
  | '/(host)'
  | '/(driver)'
  | '/(auth)/login'
  | '/(tabs)/admin';

const AUTH_ROLE_LOG = '[auth-role]';

let lastDetectedRoleLogKey = '';
let lastRoutedRoleLogKey = '';

/** Firestore `users.role` for new customer accounts. */
export function roleForSignupIntent(intent: SignupIntent): UserRole {
  switch (intent) {
    case 'restaurant':
      return 'restaurant';
    case 'driver':
      return 'driver';
    default:
      return 'user';
  }
}

export function parseSignupIntent(raw: unknown): SignupIntent {
  if (raw === 'restaurant' || raw === 'host') return 'restaurant';
  if (raw === 'driver') return 'driver';
  return 'user';
}

/** @see {@link roleRouteResolver} in `@/lib/routing/routePaths`. */
export function getRouteForRole(role: UserRole | null | undefined): AuthRoleRoute {
  return roleRouteResolver(role) as AuthRoleRoute;
}

export function resetAuthRoleLogs(): void {
  lastDetectedRoleLogKey = '';
  lastRoutedRoleLogKey = '';
}

export function logAuthRoleDetected(
  role: UserRole | null | undefined,
  uid?: string | null,
): void {
  if (!__DEV__) return;
  const normalized = normalizeRoleForRouting(role);
  const key = `${uid?.trim() || 'no-uid'}:${normalized}`;
  if (lastDetectedRoleLogKey === key) return;
  lastDetectedRoleLogKey = key;
  console.log(AUTH_ROLE_LOG, 'detected role:', normalized);
}

export function logAuthRoleRouted(
  role: UserRole | null | undefined,
  route: AuthRoleRoute,
  uid?: string | null,
): void {
  if (!__DEV__) return;
  const normalized = normalizeRoleForRouting(role);
  const key = `${uid?.trim() || 'no-uid'}:${normalized}:${route}`;
  if (lastRoutedRoleLogKey === key) return;
  lastRoutedRoleLogKey = key;
  console.log(AUTH_ROLE_LOG, 'routed to:', route, { role: normalized });
}
