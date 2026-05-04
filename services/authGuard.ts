import { auth, ensureAuthReady } from '@/services/firebase';

/** Use before Stripe / protected HTTP so callables always receive a valid ID token. */
export async function requireAuthReady(): Promise<void> {
  await ensureAuthReady();
  if (!auth.currentUser) {
    console.warn('[authGuard] requireAuthReady: no auth.currentUser after ensureAuthReady');
    throw new Error('Not signed in. Please log in and try again.');
  }
}
