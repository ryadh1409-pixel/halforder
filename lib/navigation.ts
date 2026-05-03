import { router } from 'expo-router';

/** Main tab shell — same as app root redirect after terms (`/` → `/(tabs)`). */
const TABS_ROOT = '/(tabs)' as const;

export function goHome(): void {
  if (__DEV__) {
    console.log('[nav] goHome →', TABS_ROOT);
  }
  try {
    router.replace(TABS_ROOT as never);
  } catch (e) {
    if (__DEV__) {
      console.warn('[nav] goHome failed', e);
    }
  }
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
  goHome();
}
