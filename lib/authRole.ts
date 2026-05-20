import type { UserRole } from '@/services/userService';

/** Signup / upgrade intent from auth or profile flows. */
export type SignupIntent = 'user' | 'restaurant' | 'driver';

export type AuthRoleRoute =
  | '/(tabs)'
  | '/(tabs)/host'
  | '/(driver)'
  | '/admin';

const AUTH_ROLE_LOG = '[auth-role]';

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

/** Normalize legacy values (`customer`, `host`) for routing. */
export function normalizeRoleForRouting(role: UserRole | null | undefined): UserRole {
  if (!role) return 'user';
  if (role === 'customer') return 'user';
  if (role === 'host') return 'restaurant';
  return role;
}

export function getRouteForRole(role: UserRole | null | undefined): AuthRoleRoute {
  const r = normalizeRoleForRouting(role);
  switch (r) {
    case 'driver':
      return '/(driver)';
    case 'admin':
      return '/admin';
    case 'restaurant':
      return '/(tabs)/host';
    case 'user':
    default:
      return '/(tabs)';
  }
}

export function logAuthRoleDetected(role: UserRole | null | undefined): void {
  if (!__DEV__) return;
  console.log(AUTH_ROLE_LOG, 'detected role:', normalizeRoleForRouting(role));
}

export function logAuthRoleRouted(
  role: UserRole | null | undefined,
  route: AuthRoleRoute,
): void {
  if (!__DEV__) return;
  console.log(AUTH_ROLE_LOG, 'routed to:', route, { role: normalizeRoleForRouting(role) });
}
