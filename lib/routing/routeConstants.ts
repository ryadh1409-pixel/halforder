/**
 * Pure route-group segment / pathname detection — no auth or role imports.
 */

export type RouteGroup =
  | '(driver)'
  | '(tabs)'
  | '(host)'
  | '(auth)'
  | '(customer)'
  | '(restaurant)'
  | 'other';

function firstPathSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] ?? '';
}

export function isInDriverGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(driver)') return true;
  if (segments.includes('(driver)')) return true;
  if (pathname.includes('(driver)')) return true;
  if (segments[0] === 'driver') return true;
  if (/^\/driver\//.test(pathname)) return true;
  return false;
}

export function isInHostGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(host)') return true;
  if (segments.includes('(host)')) return true;
  if (pathname.includes('(host)')) return true;
  return false;
}

export function isInTabsGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(tabs)') return true;
  if (segments.includes('(tabs)')) return true;
  if (pathname.includes('(tabs)')) return true;
  return false;
}

export function isInUserGroup(segments: string[], pathname: string): boolean {
  if (segments[0] === '(customer)' || segments.includes('(customer)')) return true;
  if (pathname.includes('(customer)')) return true;
  return isInTabsGroup(segments, pathname);
}

export function getRouteGroup(segments: string[], pathname: string): RouteGroup {
  const root = segments[0];
  if (root === '(driver)' || isInDriverGroup(segments, pathname)) return '(driver)';
  if (root === '(tabs)' || isInTabsGroup(segments, pathname)) return '(tabs)';
  if (root === '(host)' || pathname.includes('(host)')) return '(host)';
  if (root === '(auth)' || pathname.includes('(auth)')) return '(auth)';
  if (root === '(customer)' || pathname.includes('(customer)')) return '(customer)';
  if (root === '(restaurant)' || pathname.includes('(restaurant)')) return '(restaurant)';
  return 'other';
}

/**
 * Pathname-first route-group inference.
 * Segments are intentionally ignored to avoid transient stale segment flashes.
 */
export function getRouteGroupFromPathname(pathname: string): RouteGroup {
  if (pathname.includes('(driver)') || /^\/driver(\/|$)/.test(pathname)) return '(driver)';
  if (pathname.includes('(host)')) return '(host)';
  if (pathname.includes('(tabs)')) return '(tabs)';
  if (pathname.includes('(auth)') || /^\/(login|register|forgot-password)(\/|$)/.test(pathname)) {
    return '(auth)';
  }

  // Canonical host tabs resolve without group tokens in pathname.
  const root = firstPathSegment(pathname);
  if (root === 'dashboard' || root === 'menu') return '(host)';

  return 'other';
}

/** Segment-only route-group inference (for stale-state comparison). */
export function getRouteGroupFromSegments(segments: string[]): RouteGroup {
  const root = segments[0];
  if (root === '(driver)' || segments.includes('(driver)') || root === 'driver') return '(driver)';
  if (root === '(tabs)' || segments.includes('(tabs)')) return '(tabs)';
  if (root === '(host)' || segments.includes('(host)')) return '(host)';
  if (root === '(auth)' || segments.includes('(auth)')) return '(auth)';
  if (root === '(customer)' || segments.includes('(customer)')) return '(customer)';
  if (root === '(restaurant)' || segments.includes('(restaurant)')) return '(restaurant)';
  return 'other';
}
