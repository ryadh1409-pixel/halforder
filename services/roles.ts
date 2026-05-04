import type { User } from 'firebase/auth';

import type { UserRole } from './userService';

/**
 * Venue host (Stripe Connect owner). Firebase `User` has no `role` field — use Firestore role from `useAuth().role`.
 * Supports `users.role` values `host`, `restaurant`, and `admin` (admin may own a venue).
 */
export function isHostUser(user: User | null, role: UserRole | null): boolean {
  if (!user?.uid) return false;
  return role === 'host' || role === 'restaurant' || role === 'admin';
}

/** Signed-in host viewing their own restaurant id (cart / checkout). */
export function isOwnerHost(
  user: User | null,
  role: UserRole | null,
  restaurantId: string,
): boolean {
  const rid = typeof restaurantId === 'string' ? restaurantId.trim() : '';
  if (!rid || !user?.uid || user.uid !== rid) return false;
  return isHostUser(user, role);
}
