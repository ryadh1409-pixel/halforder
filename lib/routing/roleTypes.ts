import type { UserRole } from '@/services/userService';

/** Normalized roles used for routing decisions (no legacy aliases). */
export type RoutingRole = 'user' | 'restaurant' | 'driver' | 'admin';

/** Normalize Firestore / legacy role values for routing — pure, no auth imports. */
export function normalizeRoleForRouting(role: UserRole | null | undefined): RoutingRole {
  if (!role) return 'user';
  if (role === 'customer') return 'user';
  if (role === 'host') return 'restaurant';
  if (role === 'restaurant') return 'restaurant';
  if (role === 'driver') return 'driver';
  if (role === 'admin') return 'admin';
  return 'user';
}

export function isCustomerTabsRole(role: UserRole | null | undefined): boolean {
  const r = normalizeRoleForRouting(role);
  return r === 'user' || r === 'admin';
}
