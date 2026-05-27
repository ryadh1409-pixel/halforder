import { auth } from './firebase';

let nextPromiseId = 0;

export type FirestoreQueryStartPayload = {
  /** Source file for grep (e.g. `hooks/useHomeRestaurants.ts`). */
  file: string;
  /** Stable listener id (e.g. `useHomeRestaurants.restaurants`). */
  listener: string;
  collection: string;
  filters?: Record<string, unknown>;
};

/**
 * Dev-only: assign monotonic `promiseId` (0, 1, 2…) before each Firestore read/listener.
 * Matches SDK "promise id: N" ordering when diagnosing permission-denied on startup.
 */
export function beginFirestoreQuery(payload: FirestoreQueryStartPayload): number {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return -1;

  const promiseId = nextPromiseId++;
  const user = auth.currentUser;

  // eslint-disable-next-line no-console
  console.log('[QUERY START]', {
    promiseId,
    file: payload.file,
    listener: payload.listener,
    collection: payload.collection,
    filters: payload.filters ?? {},
    authUid: user?.uid ?? null,
    isAnonymous: user?.isAnonymous ?? null,
  });

  void enrichQueryStartWithTokenRole(promiseId, payload.listener);

  return promiseId;
}

async function enrichQueryStartWithTokenRole(
  promiseId: number,
  listener: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdTokenResult();
    const role =
      typeof token.claims.role === 'string' && token.claims.role.trim()
        ? token.claims.role.trim()
        : null;
    if (role) {
      // eslint-disable-next-line no-console
      console.log('[QUERY START] auth claim', { promiseId, listener, role });
    }
  } catch {
    /* ignore */
  }
}

export function logFirestoreQueryFailed(
  promiseId: number,
  listener: string,
  error: unknown,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined;
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: string }).message)
      : undefined;
  // eslint-disable-next-line no-console
  console.error('[QUERY FAILED]', {
    promiseId,
    listener,
    code,
    message,
  });
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

/** @deprecated Use {@link beginFirestoreQuery} — kept for driver call sites. */
export async function logDriverQueryStart(payload: {
  listener: string;
  collection: string;
  filters: Record<string, unknown>;
  file?: string;
}): Promise<void> {
  beginFirestoreQuery({
    file: payload.file ?? 'services/delivery',
    listener: payload.listener,
    collection: payload.collection,
    filters: payload.filters,
  });
}

/** @deprecated Use {@link logFirestoreQueryFailed} */
export function logDriverQueryError(listener: string, error: unknown): void {
  logFirestoreQueryFailed(-1, listener, error);
}
