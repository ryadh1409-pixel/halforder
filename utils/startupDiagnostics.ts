/** Dev-only structured startup logs — production no-ops. */

type LogPayload = Record<string, unknown>;

const lastKeys = new Map<string, string>();

function logOnce(tag: string, payload: LogPayload): void {
  if (!__DEV__) return;
  const key = JSON.stringify(payload);
  if (lastKeys.get(tag) === key) return;
  lastKeys.set(tag, key);
  console.log(tag, payload);
}

export function resetStartupDiagnostics(): void {
  lastKeys.clear();
}

export function logBoot(message: string, detail?: LogPayload): void {
  logOnce('[BOOT]', { message, ...detail });
}

export function logAuth(message: string, detail?: LogPayload): void {
  logOnce('[AUTH]', { message, ...detail });
}

export function logHydration(message: string, detail?: LogPayload): void {
  logOnce('[HYDRATION]', { message, ...detail });
}

export function logRouterReady(detail?: LogPayload): void {
  logOnce('[ROUTER READY]', detail ?? {});
}

export function logRedirect(tag: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  console.log(`[REDIRECT] ${tag}`, detail ?? {});
}

export function logGuard(guard: string, detail?: LogPayload): void {
  logOnce(`[GUARD] ${guard}`, detail ?? {});
}

export function logFailsafe(message: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  console.warn(`[FAILSAFE] ${message}`, detail ?? {});
}
