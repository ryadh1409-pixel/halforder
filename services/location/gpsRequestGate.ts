/** Prevents duplicate in-flight GPS work and rapid user tap spam. */

export const USER_GPS_TAP_DEBOUNCE_MS = 2_000;

const inFlight = new Map<string, Promise<unknown>>();
let lastUserGpsTapMs = 0;

/** True when the user may start another explicit GPS action (button tap). */
export function shouldAllowUserGpsTap(): boolean {
  const now = Date.now();
  if (now - lastUserGpsTapMs < USER_GPS_TAP_DEBOUNCE_MS) {
    return false;
  }
  lastUserGpsTapMs = now;
  return true;
}

/** Coalesce concurrent GPS calls that share the same key (re-renders, double taps). */
export async function runDedupedGpsRequest<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const normalized = key.trim();
  if (!normalized) {
    return fn();
  }

  const existing = inFlight.get(normalized);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlight.delete(normalized);
  });
  inFlight.set(normalized, promise);
  return promise;
}
