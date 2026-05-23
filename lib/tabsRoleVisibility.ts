import { normalizeRoleForRouting } from '@/lib/authRole';
import type { UserRole } from '@/services/userService';
import type { Href } from 'expo-router';

export type TabsShellRole = ReturnType<typeof normalizeRoleForRouting>;

export function resolveTabsShellRole(
  role: UserRole | null | undefined,
  loading: boolean,
): TabsShellRole {
  if (loading) return 'user';
  return normalizeRoleForRouting(role);
}

/** Expo Router: `href: null` removes the tab from the tab bar and deep links. */
export function tabHrefForRole(
  role: TabsShellRole,
  href: Href,
  opts: { allow?: TabsShellRole[]; deny?: TabsShellRole[] },
): Href | null {
  if (opts.deny?.includes(role)) return null;
  if (opts.allow && !opts.allow.includes(role)) return null;
  return href;
}

export const CUSTOMER_TAB_NAMES = [
  'index',
  'swipe',
  'explore',
  'search',
  'cart',
  'profile',
] as const;

export const RESTAURANT_TAB_NAMES = ['host', 'orders', 'menu', 'profile'] as const;

export const ADMIN_EXTRA_TAB_NAMES = ['admin'] as const;

export function visibleTabNamesForRole(role: TabsShellRole): string[] {
  switch (role) {
    case 'restaurant':
      return [...RESTAURANT_TAB_NAMES];
    case 'admin':
      return [...CUSTOMER_TAB_NAMES, ...ADMIN_EXTRA_TAB_NAMES];
    case 'driver':
      return [];
    case 'user':
    default:
      return [...CUSTOMER_TAB_NAMES];
  }
}
