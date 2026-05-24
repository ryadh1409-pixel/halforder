/**
 * Pure bootstrap phase machine — no React, no side effects.
 */

export type BootstrapPhase =
  | 'idle'
  | 'authRestoring'
  | 'roleResolving'
  | 'routerHydrating'
  | 'redirecting'
  | 'appReady';

const PHASE_RANK: Record<BootstrapPhase, number> = {
  idle: 0,
  authRestoring: 1,
  roleResolving: 2,
  routerHydrating: 3,
  redirecting: 4,
  appReady: 5,
};

export type BootstrapInputs = {
  authReady: boolean;
  roleResolved: boolean;
  authLoading: boolean;
  hasRegisteredUser: boolean;
  routerReady: boolean;
  redirectSettled: boolean;
  /** Monotonic shell latch — user can see router tree */
  interactiveLatched: boolean;
};

/** Advance phase forward only (no regression). */
export function advanceBootstrapPhase(
  current: BootstrapPhase,
  next: BootstrapPhase,
): BootstrapPhase {
  if (PHASE_RANK[next] > PHASE_RANK[current]) return next;
  return current;
}

export function computeBootstrapPhase(input: BootstrapInputs): BootstrapPhase {
  if (!input.authReady || input.authLoading) {
    return 'authRestoring';
  }

  if (input.hasRegisteredUser && !input.roleResolved) {
    return 'roleResolving';
  }

  if (!input.routerReady) {
    return 'routerHydrating';
  }

  if (!input.hasRegisteredUser) {
    return 'appReady';
  }

  if (!input.redirectSettled && !input.interactiveLatched) {
    return 'redirecting';
  }

  return 'appReady';
}

export function isBootstrapInteractive(phase: BootstrapPhase): boolean {
  return phase === 'appReady';
}

export function shouldRunStartupRedirect(input: BootstrapInputs): boolean {
  return (
    input.authReady &&
    !input.authLoading &&
    input.roleResolved &&
    input.hasRegisteredUser &&
    input.routerReady &&
    !input.redirectSettled
  );
}
