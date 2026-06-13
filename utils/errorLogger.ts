/**
 * Developer logging only — never shown in UI. Always logs in production for support.
 */
export function logError(error: unknown): void {
  if (error && typeof error === 'object') {
    const rec = error as { code?: string; message?: string; stack?: string };
    if (rec.code || rec.message) {
      console.error('[error]', {
        code: rec.code,
        message: rec.message,
        stack: rec.stack,
      });
      return;
    }
  }

  if (error instanceof Error) {
    console.error('[error]', error.message, error.stack);
    return;
  }

  console.error('[error]', String(error));
}
