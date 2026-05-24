/**
 * Pure router hydration helpers.
 * MUST NOT import roleRouteGuard, startup orchestrators, or React.
 */

export type RouterHydrationInput = {
  authReady: boolean;
  roleResolved: boolean;
  pathname: string;
  segments: string[];
};

export function normalizePathname(pathname: string): string {
  const p = (pathname ?? '').trim();
  if (!p || p === '/') return '/';
  return p.startsWith('/') ? p : `/${p}`;
}

/** True when the app is still on the file-based index route (`app/index`). */
export function isRootEntryPathname(pathname: string): boolean {
  const p = normalizePathname(pathname);
  return p === '/' || p === '/index';
}

/**
 * True when Expo has attached a concrete route group or left the bare index.
 * Empty segments at `/` is valid and must NOT block entry redirects.
 */
export function hasResolvedRouteContext(pathname: string, segments: string[]): boolean {
  if (!isRootEntryPathname(pathname)) return true;
  if (segments.length > 0) return true;
  if (pathname.includes('(') && pathname.includes(')')) return true;
  return false;
}

/** Safe to run post-navigation route-group diagnostics (dev only). */
export function canRunRouteGroupDiagnostics(ctx: RouterHydrationInput): boolean {
  if (!ctx.authReady || !ctx.roleResolved) return false;
  if (isRootEntryPathname(ctx.pathname) && ctx.segments.length === 0) return false;
  return true;
}

/**
 * Router is ready for wrong-group recovery (needs segment context).
 * Entry redirect from `/` uses {@link isRootEntryPathname} instead — never waits on segments.
 */
export function isRouterReadyForRecovery(
  pathname: string,
  segments: string[],
  hydrationTimedOut: boolean,
): boolean {
  if (hydrationTimedOut) return true;
  return hasResolvedRouteContext(pathname, segments);
}
