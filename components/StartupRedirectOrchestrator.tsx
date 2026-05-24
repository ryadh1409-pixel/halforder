import { useBootstrap } from '@/contexts/BootstrapContext';
import { useStableRouteContext } from '@/hooks/useStableRouteContext';
import { logAuthRoleDetected, logAuthRoleRouted } from '@/lib/authRole';
import { normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import { isOnAuthRoute, isRegisteredAuthUser } from '@/lib/authSession';
import { roleDefaultPath } from '@/lib/routing/routePaths';
import { hasPersistentRoleRouteGroupViolation } from '@/lib/routing/routeMaps';
import { evaluateRoleRedirect, sessionKeyForRole } from '@/lib/router/redirectPolicy';
import { isRootEntryPathname } from '@/lib/router/hydration';
import { runRootNavigationTask } from '@/lib/router/rootNavigation';
import {
  clearStartupNavigationState,
  completedRoleRedirects,
  markRedirectCompleted,
} from '@/lib/startup/state';
import { useAuth } from '@/services/AuthContext';
import {
  logGuard,
  logRedirect,
  markRedirectStart,
} from '@/utils/startupDiagnostics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';

/** Last-resort only — not used for normal hydration completion. */
const EMERGENCY_STUCK_MS = __DEV__ ? 8000 : 12000;

/**
 * Single root navigation owner: signed-out guard, startup landing, and cross-shell recovery.
 * Must not run from nested layouts — only here after root Slot + router are ready.
 */
export function StartupRedirectOrchestrator() {
  const router = useRouter();
  const { shouldRedirect, routerReady, redirectSettled } = useBootstrap();
  const { firestoreUserRole: role, user, authReady, loading, roleResolved } = useAuth();
  const [redirectInFlight, setRedirectInFlight] = useState(false);

  const redirectInFlightRef = useRef(false);
  const redirectCompletedRef = useRef(false);
  const boundaryLatchRef = useRef<string | null>(null);
  const signedOutLatchRef = useRef(false);
  const prevUidRef = useRef<string | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerReadyRef = useRef(routerReady);
  routerReadyRef.current = routerReady;
  const stableRoute = useStableRouteContext({
    redirectInFlight,
  });

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (prevUidRef.current === uid) return;

    if (prevUidRef.current) {
      clearStartupNavigationState();
    }
    prevUidRef.current = uid;
    redirectInFlightRef.current = false;
    setRedirectInFlight(false);
    redirectCompletedRef.current = false;
    boundaryLatchRef.current = null;
    signedOutLatchRef.current = false;

    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, [user?.uid]);

  const replaceAtRoot = (target: string, reason: string, meta?: Record<string, unknown>) => {
    if (!routerReadyRef.current) return;
    runRootNavigationTask(() => {
      if (!routerReadyRef.current) return;
      setRedirectInFlight(true);
      logRedirect(reason, { from: stableRoute.pathname, to: target, ...meta });
      router.replace(target as never);
    });
  };

  useEffect(() => {
    if (!routerReady) return;

    if (isRegisteredAuthUser(user)) {
      signedOutLatchRef.current = false;
      return;
    }
    if (!authReady || loading) return;

    const segmentList = stableRoute.stableSegments;
    if (!stableRoute.settled) return;
    if (isOnAuthRoute(stableRoute.pathname, segmentList)) return;
    if (signedOutLatchRef.current) return;

    signedOutLatchRef.current = true;
    replaceAtRoot('/(auth)/login', 'signed-out', {
      reason: user?.isAnonymous ? 'anonymous-session' : 'signed-out',
    });
  }, [
    authReady,
    loading,
    routerReady,
    stableRoute.pathname,
    stableRoute.settled,
    stableRoute.stableSegments,
    user,
  ]);

  useEffect(() => {
    if (!routerReady || !role || !user?.uid || !authReady || loading || !roleResolved) return;

    if (redirectInFlightRef.current || !stableRoute.settled || stableRoute.redirectInFlight) return;
    const segmentList = stableRoute.stableSegments;
    const normalized = normalizeRoleForRouting(role);

    if (hasPersistentRoleRouteGroupViolation(role, stableRoute.pathname, segmentList)) {
      const target = roleDefaultPath(role);
      const targetStr = typeof target === 'string' ? target : String(target);
      const latchKey = `${stableRoute.pathname}→${targetStr}`;
      if (boundaryLatchRef.current === latchKey) return;
      boundaryLatchRef.current = latchKey;

      if (__DEV__) {
        console.warn('[ROUTE GROUP CHECK] boundary violation — root redirect', {
          role: normalized,
          pathname: stableRoute.pathname,
          segments: segmentList,
          target: targetStr,
        });
      }

      logGuard('StartupRedirect:boundary', {
        role: normalized,
        pathname: stableRoute.pathname,
        segments: segmentList,
        target: targetStr,
      });

      replaceAtRoot(targetStr, 'wrong-route-group-recovery', {
        role: normalized,
        segments: segmentList,
      });
      return;
    }

    boundaryLatchRef.current = null;
  }, [
    authReady,
    loading,
    role,
    roleResolved,
    routerReady,
    stableRoute.pathname,
    stableRoute.redirectInFlight,
    stableRoute.settled,
    stableRoute.stableSegments,
    user?.uid,
  ]);

  useEffect(() => {
    if (!shouldRedirect || !role || !user?.uid || !routerReady) return;

    if (stuckTimerRef.current) return;
    stuckTimerRef.current = setTimeout(() => {
      if (redirectCompletedRef.current || redirectSettled) return;
      if (!isRootEntryPathname(stableRoute.pathname)) return;

      const normalized = normalizeRoleForRouting(role);
      const targetRoute = roleDefaultPath(normalized);
      const sessionKey = sessionKeyForRole(user.uid, role);

      if (redirectInFlightRef.current || completedRoleRedirects.has(sessionKey)) return;

      redirectInFlightRef.current = true;
      redirectCompletedRef.current = true;
      markRedirectCompleted(targetRoute as string, sessionKey);
      replaceAtRoot(targetRoute as string, 'emergency-stuck-root', {
        ms: EMERGENCY_STUCK_MS,
      });
    }, EMERGENCY_STUCK_MS);

    return () => {
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
    };
  }, [shouldRedirect, role, user?.uid, routerReady, stableRoute.pathname, redirectSettled, router]);

  useEffect(() => {
    if (!shouldRedirect || !role || !user?.uid || !routerReady) return;
    if (!authReady || loading || !roleResolved) return;

    if (!stableRoute.settled || stableRoute.redirectInFlight) return;
    const segmentList = stableRoute.stableSegments;
    if (hasPersistentRoleRouteGroupViolation(role, stableRoute.pathname, segmentList)) {
      return;
    }

    const normalized = normalizeRoleForRouting(role);
    const targetRoute = roleDefaultPath(normalized);
    const sessionKey = sessionKeyForRole(user.uid, role);
    const sessionAlreadyDone = completedRoleRedirects.has(sessionKey);

    const decision = evaluateRoleRedirect({
      uid: user.uid,
      role,
      pathname: stableRoute.pathname,
      segments: segmentList,
      sessionAlreadyDone,
    });

    if (decision.action === 'skip') {
      logGuard('StartupRedirect', {
        action: 'skip',
        reason: decision.reason,
        pathname: stableRoute.pathname,
        segments: segmentList,
      });
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
      setRedirectInFlight(false);
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
      return;
    }

    if (redirectInFlightRef.current || redirectCompletedRef.current || sessionAlreadyDone) {
      return;
    }

    redirectInFlightRef.current = true;
    redirectCompletedRef.current = true;
    markRedirectStart();
    markRedirectCompleted(decision.targetRoute, sessionKey);
    logAuthRoleDetected(normalized, user.uid);
    logAuthRoleRouted(normalized, targetRoute, user.uid);
    replaceAtRoot(decision.targetRoute, decision.reason, {
      role: normalized,
      segments: segmentList,
    });

    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, [
    authReady,
    loading,
    roleResolved,
    shouldRedirect,
    role,
    router,
    routerReady,
    stableRoute.pathname,
    stableRoute.redirectInFlight,
    stableRoute.settled,
    stableRoute.stableSegments,
    user?.uid,
    redirectInFlight,
  ]);

  return null;
}
