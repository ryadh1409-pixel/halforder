import { normalizePathname } from '@/lib/router/hydration';
import {
  getRouteGroupFromPathname,
  getRouteGroupFromSegments,
  type RouteGroup,
} from '@/lib/routing/routeConstants';

export type StableRouteContextInput = {
  pathname: string | null | undefined;
  segments: string[];
  redirectInFlight: boolean;
  stableSegments?: string[];
};

export type StableRouteContext = {
  pathname: string;
  normalizedGroup: RouteGroup;
  stableSegments: string[];
  redirectInFlight: boolean;
  pathnameGroup: RouteGroup;
  segmentsGroup: RouteGroup;
  staleSegmentSnapshot: boolean;
};

/**
 * Build a stabilized route context with pathname as primary source of truth.
 */
export function getStableRouteContext(input: StableRouteContextInput): StableRouteContext {
  const pathname = normalizePathname(input.pathname);
  const stableSegments = input.stableSegments ?? input.segments;
  const pathnameGroup = getRouteGroupFromPathname(pathname);
  const segmentsGroup = getRouteGroupFromSegments(stableSegments);
  const normalizedGroup = pathnameGroup !== 'other' ? pathnameGroup : segmentsGroup;

  return {
    pathname,
    normalizedGroup,
    stableSegments,
    redirectInFlight: input.redirectInFlight,
    pathnameGroup,
    segmentsGroup,
    staleSegmentSnapshot:
      pathnameGroup !== 'other' &&
      segmentsGroup !== 'other' &&
      pathnameGroup !== segmentsGroup,
  };
}
