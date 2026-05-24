/** Dev-only structured startup logs — production no-ops. */

type LogPayload = Record<string, unknown>;

const lastKeys = new Map<string, string>();
const timings = new Map<string, number>();

let bootStartedAt = 0;

export function markBootStart(): void {
  if (!__DEV__) return;
  bootStartedAt = Date.now();
}

export function resetStartupDiagnostics(): void {
  lastKeys.clear();
  timings.clear();
  bootStartedAt = 0;
}

function logOnce(tag: string, payload: LogPayload): void {
  if (!__DEV__) return;
  const key = JSON.stringify(payload);
  if (lastKeys.get(tag) === key) return;
  lastKeys.set(tag, key);
  const elapsed = bootStartedAt ? Date.now() - bootStartedAt : 0;
  console.log(tag, { ...payload, elapsedMs: elapsed });
}

export function logBoot(message: string, detail?: LogPayload): void {
  logOnce('[BOOT]', { message, ...detail });
}

export function logAuth(message: string, detail?: LogPayload): void {
  logOnce('[AUTH]', { message, ...detail });
}

export function logHydration(message: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  const started = timings.get('hydration-start') ?? bootStartedAt;
  const durationMs = started ? Date.now() - started : 0;
  console.log('[HYDRATION]', { message, durationMs, ...detail });
}

export function markHydrationStart(): void {
  if (!__DEV__) return;
  if (!timings.has('hydration-start')) {
    timings.set('hydration-start', Date.now());
  }
}

export function logRouterReady(detail?: LogPayload): void {
  if (!__DEV__) return;
  const started = timings.get('hydration-start') ?? bootStartedAt;
  const hydrationMs = started ? Date.now() - started : 0;
  logOnce('[ROUTER READY]', { hydrationMs, ...detail });
}

export function logPhaseTransition(from: string, to: string, detail?: LogPayload): void {
  logOnce('[BOOT]', { message: 'phase', from, to, ...detail });
}

export function logRedirect(tag: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  const started = timings.get('redirect-start');
  const redirectMs = started ? Date.now() - started : undefined;
  console.log(`[REDIRECT] ${tag}`, { redirectMs, ...detail });
}

export function markRedirectStart(): void {
  if (!__DEV__) return;
  if (!timings.has('redirect-start')) {
    timings.set('redirect-start', Date.now());
  }
}

export function logGuard(guard: string, detail?: LogPayload): void {
  logOnce(`[GUARD] ${guard}`, detail ?? {});
}

export function logFailsafe(message: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  console.warn(`[FAILSAFE] ${message}`, detail ?? {});
}

export function logUnexpectedRemount(component: string, detail?: LogPayload): void {
  if (!__DEV__) return;
  console.warn('[BOOT] unexpected-remount', { component, ...detail });
}
