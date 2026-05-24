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

export function normalizePathname(pathname: string | null | undefined): string {
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
 * Event-driven: Expo Router context is active when pathname is a string.
 * Empty segments at `/` is valid hydrated state.
 */
export function isRouterNavigationReady(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string';
}

/**
 * True when route context is sufficient for recovery/diagnostics.
 * At `/` with [] segments, navigation is still ready for entry redirect.
 */
export function hasResolvedRouteContext(pathname: string, segments: string[]): boolean {
  if (!isRouterNavigationReady(pathname)) return false;
  if (!isRootEntryPathname(pathname)) return true;
  if (segments.length > 0) return true;
  if (pathname.includes('(') && pathname.includes(')')) return true;
  return true;
}

/** Safe to run post-navigation route-group diagnostics (dev only). */
export function canRunRouteGroupDiagnostics(ctx: RouterHydrationInput): boolean {
  if (!ctx.authReady || !ctx.roleResolved) return false;
  if (!isRouterNavigationReady(ctx.pathname)) return false;
  if (isRootEntryPathname(ctx.pathname) && ctx.segments.length === 0) return false;
  return true;
}

/** Router ready for wrong-group recovery. */
export function isRouterReadyForRecovery(pathname: string, segments: string[]): boolean {
  return hasResolvedRouteContext(pathname, segments);
}
