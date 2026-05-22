import { auth } from './firebase';

export type DriverQueryLogPayload = {
  listener: string;
  collection: string;
  filters: Record<string, unknown>;
};

export async function getFirestoreQueryAuthContext(): Promise<{
  authUid: string | null;
  role: string | null;
}> {
  const user = auth.currentUser;
  if (!user) return { authUid: null, role: null };
  try {
    const token = await user.getIdTokenResult();
    const role =
      typeof token.claims.role === 'string' && token.claims.role.trim()
        ? token.claims.role.trim()
        : null;
    return { authUid: user.uid, role };
  } catch {
    return { authUid: user.uid, role: null };
  }
}

/** Dev diagnostics before driver Firestore listeners attach. */
export async function logDriverQueryStart(payload: DriverQueryLogPayload): Promise<void> {
  if (!__DEV__) return;
  const authCtx = await getFirestoreQueryAuthContext();
  // eslint-disable-next-line no-console
  console.log('[QUERY START]', {
    listener: payload.listener,
    collection: payload.collection,
    filters: payload.filters,
    authUid: authCtx.authUid,
    role: authCtx.role,
  });
  // eslint-disable-next-line no-console
  console.log('[QUERY FILTERS]', payload.filters);
}

export function logDriverQueryError(listener: string, error: unknown): void {
  console.error('[QUERY ERROR]', { listener, error });
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code?: string }).code === 'permission-denied' ||
      (error as { code?: string }).code === 'missing-or-insufficient-permissions')
  );
}
