import type { UserRole } from '@/services/userService';

/** Signup / upgrade intent from auth or profile flows. */
export type SignupIntent = 'user' | 'restaurant' | 'driver';

export type AuthRoleRoute =
  | '/(tabs)'
  | '/(host)'
  | '/(driver)'
  | '/admin';

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
      return '/(host)';
    case 'user':
    default:
      return '/(tabs)';
  }
}

export function resetAuthRoleLogs(): void {
  lastDetectedRoleLogKey = '';
  lastRoutedRoleLogKey = '';
}

/** Dev-only — logs once per uid+role per session (avoids hydration duplicate spam). */
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
