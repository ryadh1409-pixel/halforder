import {
  getStableRouteContext,
  type StableRouteContext,
} from '@/lib/router/stableRouteContext';
import { usePathname, useRootNavigationState, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

const STABILIZE_MS = 180;

type UseStableRouteContextParams = {
  redirectInFlight: boolean;
};

/**
 * Stabilizes transient Expo Router pathname/segments desync windows.
 * Pathname remains primary while segment snapshots settle.
 */
export function useStableRouteContext(
  params: UseStableRouteContextParams,
): StableRouteContext & { settled: boolean } {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const rootState = useRootNavigationState();
  const [stableSegments, setStableSegments] = useState<string[]>(segments);
  const [settled, setSettled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const navSnapshotKey = [
    rootState?.key ?? 'no-key',
    rootState?.index ?? -1,
    pathname ?? '',
    segments.join('/'),
    params.redirectInFlight ? '1' : '0',
  ].join('|');

  useEffect(() => {
    setSettled(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // Let navigation state commit first, then settle with a short window.
    Promise.resolve().then(() => {
      rafRef.current = requestAnimationFrame(() => {
        timerRef.current = setTimeout(() => {
          setStableSegments(segments);
          setSettled(true);
          timerRef.current = null;
          rafRef.current = null;
        }, STABILIZE_MS);
      });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [navSnapshotKey, segments]);

  const ctx = getStableRouteContext({
    pathname,
    segments,
    stableSegments,
    redirectInFlight: params.redirectInFlight,
  });

  return { ...ctx, settled };
}
