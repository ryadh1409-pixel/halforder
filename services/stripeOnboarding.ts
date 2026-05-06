import { auth, ensureAuthReady } from '@/services/firebase';
import { startOnboarding } from '@/services/stripeConnect';

/**
 * Single callable: creates restaurant doc / Connect account as needed, returns Account Link URL.
 * Pass `{}` — backend uses `request.auth.uid` as `restaurants/{uid}`.
 */
export async function createOnboardingLink(): Promise<string> {
  await ensureAuthReady();
  if (!auth.currentUser) {
    throw new Error('Sign in required');
  }
  const data = (await startOnboarding(auth.currentUser.uid)) as { url?: unknown };
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
