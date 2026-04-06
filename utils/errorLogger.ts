/**
 * Developer logging only. Never shows alerts or other UI.
 */
export function logError(
  error: unknown,
  _options?: { alert?: boolean },
): void {
  if (__DEV__) {
    console.error('DEV ERROR:', error);
  }
}
