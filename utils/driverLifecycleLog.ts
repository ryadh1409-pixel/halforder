/** Dev-only driver / root lifecycle diagnostics (production-safe no-ops). */

export type DriverLayoutSnapshot = {
  pathname: string;
  segments: string[];
  role: string | null;
  authReady: boolean;
  roleResolved: boolean;
  uid: string | null;
  loading?: boolean;
  providerReady?: boolean;
  bootstrapPhase?: string;
  routeGroup?: string | null;
  reason?: string;
};

const lastDriverLayoutLogKey = new Map<string, string>();

function logKeyed(tag: string, payload: Record<string, unknown>): void {
  if (!__DEV__) return;
  const key = JSON.stringify(payload);
  if (lastDriverLayoutLogKey.get(tag) === key) return;
  lastDriverLayoutLogKey.set(tag, key);
  console.log(tag, payload);
}

export function resetDriverLifecycleLogs(): void {
  lastDriverLayoutLogKey.clear();
}

export function logDriverLayoutState(snapshot: DriverLayoutSnapshot): void {
  logKeyed('[DRIVER LAYOUT STATE]', {
    pathname: snapshot.pathname,
    segments: snapshot.segments,
    routeGroup: snapshot.routeGroup ?? snapshot.segments[0] ?? null,
    role: snapshot.role,
    authReady: snapshot.authReady,
    roleResolved: snapshot.roleResolved,
    uid: snapshot.uid,
    loading: snapshot.loading,
    providerReady: snapshot.providerReady,
    bootstrapPhase: snapshot.bootstrapPhase,
    reason: snapshot.reason,
  });
}

export function logRootBootstrapState(snapshot: DriverLayoutSnapshot): void {
  logKeyed('[ROOT BOOTSTRAP STATE]', {
    pathname: snapshot.pathname,
    segments: snapshot.segments,
    bootstrapPhase: snapshot.bootstrapPhase,
    authReady: snapshot.authReady,
    roleResolved: snapshot.roleResolved,
    uid: snapshot.uid,
    loading: snapshot.loading,
    role: snapshot.role,
    reason: snapshot.reason,
  });
}

export type RedirectDecision = {
  guard: string;
  action: 'skip' | 'redirect' | 'mark-complete';
  from: string;
  to?: string;
  reason: string;
  role?: string | null;
  segments?: string[];
};

const loggedRedirectDecisions = new Set<string>();

export function logRedirectDecision(decision: RedirectDecision): void {
  if (!__DEV__) return;
  const key = `${decision.guard}:${decision.action}:${decision.reason}:${decision.to ?? ''}`;
  if (loggedRedirectDecisions.has(key)) return;
  loggedRedirectDecisions.add(key);
  console.log('[REDIRECT DECISION]', decision);
}

export function resetRedirectDecisionLogs(): void {
  loggedRedirectDecisions.clear();
}
