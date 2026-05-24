import {
  advanceBootstrapPhase,
  computeBootstrapPhase,
  isBootstrapInteractive,
  shouldRunStartupRedirect,
  type BootstrapPhase,
} from '@/lib/startup/bootstrapMachine';
import { hasRoleShellLandingCompleted } from '@/lib/startup/state';
import { isRootEntryPathname, isRouterNavigationReady } from '@/lib/router/hydration';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import {
  logPhaseTransition,
  markBootStart,
  markHydrationStart,
  logRouterReady,
} from '@/utils/startupDiagnostics';
import { usePathname } from 'expo-router';
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type BootstrapContextValue = {
  phase: BootstrapPhase;
  interactive: boolean;
  routerReady: boolean;
  shouldRedirect: boolean;
  redirectSettled: boolean;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, authReady, roleResolved } = useAuth();

  const [routerReadyLatched, setRouterReadyLatched] = useState(false);
  const [interactiveLatched, setInteractiveLatched] = useState(false);
  const phaseRef = useRef<BootstrapPhase>('idle');
  const bootMarkedRef = useRef(false);

  const hasRegisteredUser = isRegisteredAuthUser(user);
  const redirectSettled = hasRoleShellLandingCompleted();

  useLayoutEffect(() => {
    if (!bootMarkedRef.current) {
      bootMarkedRef.current = true;
      markBootStart();
      markHydrationStart();
    }
  }, []);

  useLayoutEffect(() => {
    if (!isRouterNavigationReady(pathname)) return;
    if (routerReadyLatched) return;
    setRouterReadyLatched(true);
    logRouterReady({ pathname, event: 'pathname-available' });
  }, [pathname, routerReadyLatched]);

  useEffect(() => {
    if (!authReady) return;
    if (user?.uid) return;
    setInteractiveLatched(false);
    setRouterReadyLatched(false);
    phaseRef.current = 'idle';
  }, [authReady, user?.uid]);

  useEffect(() => {
    if (!authReady || loading) return;
    if (hasRegisteredUser && !roleResolved) return;
    if (!routerReadyLatched) return;
    if (hasRegisteredUser && !redirectSettled && isRootEntryPathname(pathname)) return;

    setInteractiveLatched((prev) => (prev ? prev : true));
  }, [
    authReady,
    hasRegisteredUser,
    loading,
    pathname,
    redirectSettled,
    roleResolved,
    routerReadyLatched,
  ]);

  const phase = useMemo(() => {
    const next = computeBootstrapPhase({
      authReady,
      roleResolved,
      authLoading: loading,
      hasRegisteredUser,
      routerReady: routerReadyLatched,
      redirectSettled,
      interactiveLatched,
    });
    const advanced = advanceBootstrapPhase(phaseRef.current, next);
    if (advanced !== phaseRef.current) {
      logPhaseTransition(phaseRef.current, advanced, {
        pathname,
        uid: user?.uid ?? null,
      });
      phaseRef.current = advanced;
    }
    return phaseRef.current;
  }, [
    authReady,
    roleResolved,
    loading,
    hasRegisteredUser,
    routerReadyLatched,
    redirectSettled,
    interactiveLatched,
    pathname,
    user?.uid,
  ]);

  const shouldRedirect = shouldRunStartupRedirect({
    authReady,
    roleResolved,
    authLoading: loading,
    hasRegisteredUser,
    routerReady: routerReadyLatched,
    redirectSettled,
    interactiveLatched,
  });

  const value = useMemo(
    (): BootstrapContextValue => ({
      phase,
      interactive: isBootstrapInteractive(phase) || interactiveLatched,
      routerReady: routerReadyLatched,
      shouldRedirect,
      redirectSettled,
    }),
    [phase, interactiveLatched, routerReadyLatched, shouldRedirect, redirectSettled],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapContextValue {
  const ctx = useContext(BootstrapContext);
  if (!ctx) {
    throw new Error('useBootstrap must be used within BootstrapProvider');
  }
  return ctx;
}
