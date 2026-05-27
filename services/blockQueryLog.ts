/** Dev diagnostics for `users/{uid}/blockedUsers` reads and writes. */

export function logBlockQueryStart(path: string, operation: string): void {
  console.log('[BLOCK QUERY START]', { path, operation });
}

export function logBlockQuerySuccess(path: string, operation: string): void {
  console.log('[BLOCK QUERY SUCCESS]', { path, operation });
}

export function logBlockQueryFailed(
  path: string,
  operation: string,
  error: unknown,
): void {
  console.error('[BLOCK QUERY FAILED]', { path, operation, error });
}
