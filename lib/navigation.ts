import { router } from 'expo-router';

import {
  getRouteForRole,
  logAuthRoleRouted,
  normalizeRoleForRouting,
} from '@/lib/authRole';
import type { UserRole } from '@/services/userService';

/** Navigate to the correct home shell for a Firestore role. */
export function navigateForRole(role: UserRole | null | undefined): void {
  const normalized = normalizeRoleForRouting(role);
  const route = getRouteForRole(normalized);
  logAuthRoleRouted(normalized, route);
  if (__DEV__) {
    console.log('[nav] navigateForRole →', route, { role: normalized });
  }
  try {
    router.replace(route as never);
  } catch (e) {
    if (__DEV__) {
      console.error('[nav] navigateForRole failed', e);
    }
  }
}

/** @deprecated Use {@link navigateForRole} after login when role is known. */
export function goHome(): void {
  navigateForRole('user');
}

export function goBackSafe(): void {
  if (__DEV__) {
    console.log('[nav] goBackSafe');
  }
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* navigation not ready */
  }
  navigateForRole('user');
}
