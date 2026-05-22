import { httpsCallable } from 'firebase/functions';

import { auth, functions, syncAuthForFirestoreReads } from './firebase';

/**
 * Ensures `request.auth.token.role` matches Firestore `users/{uid}.role`
 * (required for driver marketplace pool queries in security rules).
 */
export async function refreshAuthRoleClaims(): Promise<string | null> {
  await syncAuthForFirestoreReads();
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const refresh = httpsCallable<{ role?: string }, { role?: string }>(
      functions,
      'refreshUserRoleClaims',
    );
    const res = await refresh({});
    await user.getIdToken(true);
    const role =
      typeof res.data?.role === 'string' && res.data.role.trim()
        ? res.data.role.trim()
        : null;
    return role;
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[auth] refreshAuthRoleClaims failed', err);
    }
    return null;
  }
}

/** Refresh claims when token role is missing or stale vs expected Firestore role. */
export async function ensureAuthRoleClaim(expectedRole?: string): Promise<void> {
  await syncAuthForFirestoreReads();
  const user = auth.currentUser;
  if (!user) return;

  try {
    const token = await user.getIdTokenResult();
    const claimRole =
      typeof token.claims.role === 'string' ? token.claims.role : '';
    if (expectedRole && claimRole === expectedRole) return;
    if (!expectedRole && claimRole) return;
    await refreshAuthRoleClaims();
  } catch {
    await refreshAuthRoleClaims();
  }
}
