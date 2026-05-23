let lastAuthReadyLogKey = '';

/** Dev-only routing diagnostics — avoid spam once guards are working. */
export function logRouteRedirect(from: string, to: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log('[ROUTE REDIRECT]', { from, to, ...detail });
}

export function logRoleChange(role: string | null, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log('[ROLE CHANGE]', { role, ...detail });
}

export function resetRouteDiagnostics(): void {
  lastAuthReadyLogKey = '';
}

export function logAuthReady(ready: boolean, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const key = JSON.stringify({ ready, ...detail });
  if (lastAuthReadyLogKey === key) return;
  lastAuthReadyLogKey = key;
  console.log('[AUTH READY]', { ready, ...detail });
}
