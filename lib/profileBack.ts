import type { Router } from 'expo-router';

/**
 * Back for screens opened from Profile.
 *
 * Prefer navigation history. When the stack only pops to the tabs shell,
 * Expo can reveal the Home tab instead of Profile — dismiss to Profile
 * so Profile → child → Back returns to Profile.
 *
 * Home is used only when there is no history and dismiss is unavailable.
 */
export function goBackFromProfileScreen(router: Router): void {
  try {
    if (typeof router.dismissTo === 'function') {
      router.dismissTo('/(tabs)/profile');
      return;
    }
  } catch {
    /* dismissTo unavailable — fall through */
  }

  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* navigation not ready */
  }

  // Absolute last resort: no previous screen in the stack
  router.replace('/(tabs)' as never);
}
