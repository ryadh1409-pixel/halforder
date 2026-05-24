import { getRouteForRole, logAuthRoleDetected, logAuthRoleRouted, normalizeRoleForRouting } from '@/lib/authRole';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { evaluateRoleRedirect, sessionKeyForRole } from '@/lib/router/redirectPolicy';
import { isRootEntryPathname } from '@/lib/router/hydration';
import {
  clearStartupNavigationState,
  completedRoleRedirects,
  markRedirectCompleted,
} from '@/lib/startup/state';
import {
  logAuth,
  logFailsafe,
  logGuard,
  logHydration,
  logRedirect,
  logRouterReady,
} from '@/utils/startupDiagnostics';
import { useAuth } from '@/services/AuthContext';
import { usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';

const HYDRATION_FAILSAFE_MS = 2500;

/**
 * Single owner of signed-in role landing redirects.
 * Entry redirect from `/` never waits for segments (Expo may keep segments [] at index).
 */
export function StartupRedirectOrchestrator() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { authReady, roleResolved, firestoreUserRole: role, user, loading } = useAuth();

  const redirectInFlightRef = useRef(false);
  const redirectCompletedRef = useRef(false);
  const hydrationTimedOutRef = useRef(false);
  const failsafeLoggedRef = useRef(false);
  const prevUidRef = useRef<string | null>(null);

  const isReady =
    authReady && roleResolved && !loading && isRegisteredAuthUser(user) && Boolean(role);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (prevUidRef.current !== uid) {
      if (prevUidRef.current) {
        clearStartupNavigationState();
      }
      prevUidRef.current = uid;
      redirectInFlightRef.current = false;
      redirectCompletedRef.current = false;
      hydrationTimedOutRef.current = false;
      failsafeLoggedRef.current = false;
    }
  }, [user?.uid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hydrationTimedOutRef.current) return;
      hydrationTimedOutRef.current = true;
      logHydration('failsafe-timeout', { ms: HYDRATION_FAILSAFE_MS });
    }, HYDRATION_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [user?.uid]);

  useEffect(() => {
    if (!isReady || !role || !user?.uid) return;

    const segmentList = segments as string[];
    const normalized = normalizeRoleForRouting(role);
    const targetRoute = getRouteForRole(normalized);
    const sessionKey = sessionKeyForRole(user.uid, role);
    const sessionAlreadyDone = completedRoleRedirects.has(sessionKey);

    logAuth('ready', { uid: user.uid, role: normalized, pathname });

    if (!isRootEntryPathname(pathname) || segmentList.length > 0) {
      logRouterReady({ pathname, segments: segmentList });
    }

    const decision = evaluateRoleRedirect({
      uid: user.uid,
      role,
      pathname,
      segments: segmentList,
      sessionAlreadyDone,
      hydrationTimedOut: hydrationTimedOutRef.current,
    });

    if (decision.action === 'skip') {
      logGuard('StartupRedirect', { action: 'skip', reason: decision.reason, pathname, segments: segmentList });

      /** Emergency: stuck on `/` with auth+role — never wait forever. */
      if (
        isRootEntryPathname(pathname) &&
        (hydrationTimedOutRef.current || !redirectCompletedRef.current)
      ) {
        if (hydrationTimedOutRef.current && !redirectInFlightRef.current && !sessionAlreadyDone) {
          if (!failsafeLoggedRef.current) {
            failsafeLoggedRef.current = true;
            logFailsafe('emergency-entry-redirect', { pathname, role: normalized, targetRoute });
          }
          redirectInFlightRef.current = true;
          redirectCompletedRef.current = true;
          markRedirectCompleted(targetRoute, sessionKey);
          logRedirect('emergency', { from: pathname, to: targetRoute, role: normalized });
          logAuthRoleDetected(normalized, user.uid);
          logAuthRoleRouted(normalized, targetRoute, user.uid);
          router.replace(targetRoute as never);
        }
      }
      return;
    }

    if (decision.action === 'complete') {
      if (!redirectCompletedRef.current) {
        redirectCompletedRef.current = true;
        markRedirectCompleted(decision.targetRoute, sessionKey);
        logGuard('StartupRedirect', {
          action: 'complete',
          reason: decision.reason,
          targetRoute: decision.targetRoute,
        });
      }
      redirectInFlightRef.current = false;
      return;
    }

    if (redirectInFlightRef.current || redirectCompletedRef.current || sessionAlreadyDone) {
      return;
    }

    redirectInFlightRef.current = true;
    redirectCompletedRef.current = true;
    markRedirectCompleted(decision.targetRoute, sessionKey);
    logRedirect(decision.reason, {
      from: pathname,
      to: decision.targetRoute,
      role: normalized,
      segments: segmentList,
    });
    logAuthRoleDetected(normalized, user.uid);
    logAuthRoleRouted(normalized, targetRoute, user.uid);
    router.replace(decision.targetRoute as never);
  }, [isReady, loading, pathname, role, router, segments, user?.uid]);

  return null;
}
