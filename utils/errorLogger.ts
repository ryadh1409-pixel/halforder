/**
 * Developer logging only. Never shows alerts, popups, or in-app UI.
 */
export function logError(error: unknown): void {
  if (!__DEV__) return;

  if (error && typeof error === 'object') {
    const rec = error as { code?: string; message?: string };
    if (rec.code || rec.message) {
      console.warn('[error]', {
        code: rec.code,
        message: rec.message,
      });
      return;
    }
  }

  if (error instanceof Error) {
    console.warn('[error]', { message: error.message });
    return;
  }

  console.warn('[error]', String(error));
}
