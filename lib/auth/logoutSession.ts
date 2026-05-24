import { clearRoleRedirectGuards } from '@/lib/roleRouteGuard';
import type { Href } from 'expo-router';

/** Post-logout entry — auth shell (login is the group default). */
export const POST_LOGOUT_ROUTE = '/(auth)/login' as Href;

/**
 * Centralized authenticated logout: clears routing guards, then signs out via AuthContext.
 * Navigation must be performed by the caller after this resolves (use {@link POST_LOGOUT_ROUTE}).
 */
export async function logoutAndResetSession(
  signOutUser: () => Promise<void>,
): Promise<void> {
  if (__DEV__) {
    console.log('[AUTH] logout-start');
  }

  clearRoleRedirectGuards();

  try {
    await signOutUser();
    if (__DEV__) {
      console.log('[AUTH] logout-success');
    }
  } catch (error) {
    if (__DEV__) {
      console.log('[AUTH] logout-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}
