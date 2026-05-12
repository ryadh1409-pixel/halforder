/**
 * Logs only in `__DEV__`. In production, prefer these over raw `console.log` to keep
 * Metro / device logs smaller and avoid leaking internal details.
 */
export function devLog(...args: unknown[]): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
}

export function devError(...args: unknown[]): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.error(...args);
  }
}
