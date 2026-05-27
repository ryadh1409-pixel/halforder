/** Dev diagnostics for Profile tab Firestore / Storage operations. */

export type ProfileFsContext = {
  file: string;
  operation: string;
  path: string;
};

export function logProfileFsStart(ctx: ProfileFsContext): void {
  console.log('[PROFILE FS START]', ctx);
}

export function logProfileFsSuccess(ctx: ProfileFsContext): void {
  console.log('[PROFILE FS SUCCESS]', ctx);
}

export function logProfileFsFail(ctx: ProfileFsContext, error: unknown): void {
  console.error('[PROFILE FS FAIL]', { ...ctx, error });
}

export async function profileFirestoreOp<T>(
  ctx: ProfileFsContext,
  fn: () => Promise<T>,
): Promise<T> {
  logProfileFsStart(ctx);
  try {
    const result = await fn();
    logProfileFsSuccess(ctx);
    return result;
  } catch (error) {
    logProfileFsFail(ctx, error);
    throw error;
  }
}
