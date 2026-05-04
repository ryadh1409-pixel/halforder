import { httpsCallable } from 'firebase/functions';

import { auth, ensureAuthReady, functions } from '@/services/firebase';

/**
 * Single callable: creates restaurant doc / Connect account as needed, returns Account Link URL.
 * Pass `{}` — backend uses `request.auth.uid` as `restaurants/{uid}`.
 */
export async function createOnboardingLink(): Promise<string> {
  await ensureAuthReady();
  if (!auth.currentUser) {
    throw new Error('Sign in required');
  }

  const fn = httpsCallable(functions, 'createOnboardingLink');
  const res = await fn({});

  const data = res.data as { url?: unknown } | undefined;
  const url = data?.url;
  if (typeof url !== 'string' || !url.startsWith('http')) {
    throw new Error('No onboarding URL returned');
  }
  return url;
}

/** Same as {@link createOnboardingLink} when the host is opening setup for their own `restaurantId`. */
export async function getHostStripeOnboardingUrl(restaurantId?: string): Promise<string> {
  await ensureAuthReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const rid = (restaurantId ?? uid).trim();
  if (rid !== uid) throw new Error('restaurantId must match the signed-in user');
  return createOnboardingLink();
}
