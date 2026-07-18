import type { User } from 'firebase/auth';

/** Email/password (or linked) account — not Firebase anonymous guest session. */
export function isRegisteredAuthUser(user: User | null | undefined): boolean {
  return Boolean(user?.uid) && user?.isAnonymous !== true;
}

const AUTH_ROUTE_PATHS = new Set([
  '/login',
  '/register',
  '/password',
  '/account-not-found',
  '/phone',
  '/reset-password',
  '/verify-email',
]);

/** True when the current route is inside the `(auth)` group or a bare auth screen path. */
export function isOnAuthRoute(pathname: string, segments: string[]): boolean {
  if (segments[0] === '(auth)' || segments.includes('(auth)')) return true;
  const path = pathname.split('?')[0]?.split('#')[0] ?? '';
  if (path.includes('(auth)')) return true;
  if (AUTH_ROUTE_PATHS.has(path)) return true;
  for (const authPath of AUTH_ROUTE_PATHS) {
    if (path.startsWith(`${authPath}/`)) return true;
  }
  return false;
}
