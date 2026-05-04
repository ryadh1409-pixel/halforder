import { auth, ensureAuthReady } from '@/services/firebase';

/** Use before Stripe / protected HTTP so callables always receive a valid ID token. */
export async function requireAuthReady(): Promise<void> {
  await ensureAuthReady();
  if (!auth.currentUser) {
    throw new Error('Auth not ready');
  }
}
