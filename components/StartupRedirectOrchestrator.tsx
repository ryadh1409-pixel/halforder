import { useBootstrap } from '@/contexts/BootstrapContext';
import { getRouteForRole, logAuthRoleDetected, logAuthRoleRouted, normalizeRoleForRouting } from '@/lib/authRole';
import { evaluateRoleRedirect, sessionKeyForRole } from '@/lib/router/redirectPolicy';
import { isRootEntryPathname } from '@/lib/router/hydration';
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
import { usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';

/** Last-resort only — not used for normal hydration completion. */
const EMERGENCY_STUCK_MS = __DEV__ ? 8000 : 12000;

/**
 * Single owner of signed-in role landing redirects.
 * Runs only when bootstrap machine reports {@link shouldRedirect}.
 */
export function StartupRedirectOrchestrator() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const { shouldRedirect, routerReady, redirectSettled } = useBootstrap();
  const { firestoreUserRole: role, user } = useAuth();

  const redirectInFlightRef = useRef(false);
  const redirectCompletedRef = useRef(false);
  const prevUidRef = useRef<string | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (prevUidRef.current === uid) return;

    if (prevUidRef.current) {
      clearStartupNavigationState();
    }
    prevUidRef.current = uid;
    redirectInFlightRef.current = false;
    redirectCompletedRef.current = false;

    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!shouldRedirect || !role || !user?.uid || !routerReady) return;

    if (stuckTimerRef.current) return;
    stuckTimerRef.current = setTimeout(() => {
      if (redirectCompletedRef.current || redirectSettled) return;
      if (!isRootEntryPathname(pathname)) return;

      const normalized = normalizeRoleForRouting(role);
      const targetRoute = getRouteForRole(normalized);
      const sessionKey = sessionKeyForRole(user.uid, role);

      if (redirectInFlightRef.current || completedRoleRedirects.has(sessionKey)) return;

      redirectInFlightRef.current = true;
      redirectCompletedRef.current = true;
      markRedirectCompleted(targetRoute, sessionKey);
      logRedirect('emergency-stuck-root', {
        from: pathname,
        to: targetRoute,
        ms: EMERGENCY_STUCK_MS,
      });
      router.replace(targetRoute as never);
    }, EMERGENCY_STUCK_MS);

    return () => {
      if (stuckTimerRef.current) {
        clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
    };
  }, [shouldRedirect, role, user?.uid, routerReady, pathname, redirectSettled, router]);

  useEffect(() => {
    if (!shouldRedirect || !role || !user?.uid || !routerReady) return;

    const segmentList = segments as string[];
    const normalized = normalizeRoleForRouting(role);
    const targetRoute = getRouteForRole(normalized);
    const sessionKey = sessionKeyForRole(user.uid, role);
    const sessionAlreadyDone = completedRoleRedirects.has(sessionKey);

    const decision = evaluateRoleRedirect({
      uid: user.uid,
      role,
      pathname,
      segments: segmentList,
      sessionAlreadyDone,
    });

    if (decision.action === 'skip') {
      logGuard('StartupRedirect', { action: 'skip', reason: decision.reason, pathname, segments: segmentList });
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
    logRedirect(decision.reason, {
      from: pathname,
      to: decision.targetRoute,
      role: normalized,
      segments: segmentList,
    });
    logAuthRoleDetected(normalized, user.uid);
    logAuthRoleRouted(normalized, targetRoute, user.uid);
    router.replace(decision.targetRoute as never);

    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
  }, [shouldRedirect, pathname, role, router, routerReady, segments, user?.uid]);

  return null;
}
