import { auth, db } from '@/services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export type PaymentDocReadResult = {
  matchPath: string;
  matchExists: boolean;
  matchData: Record<string, unknown> | null;
  sharePath: string | null;
  shareExists: boolean | null;
  shareData: Record<string, unknown> | null;
  userPath: string;
  userExists: boolean;
};

function decodeMatchId(raw: string): string {
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

async function readDoc(path: string): Promise<{
  exists: boolean;
  data: Record<string, unknown> | null;
}> {
  console.log('[PAYMENT READ]', path);
  const segments = path.split('/').filter(Boolean);
  const ref =
    segments.length === 2
      ? doc(db, segments[0], segments[1])
      : segments.length === 4
        ? doc(db, segments[0], segments[1], segments[2], segments[3])
        : null;
  if (!ref) {
    throw new Error(`Unsupported Firestore path: ${path}`);
  }
  const snap = await getDoc(ref);
  console.log('[PAYMENT DOC EXISTS]', path, snap.exists());
  if (!snap.exists()) {
    console.error('[PAYMENT MISSING DOC]', path, null);
    return { exists: false, data: null };
  }
  return { exists: true, data: snap.data() as Record<string, unknown> };
}

/**
 * Client-side preflight reads before calling payment Cloud Functions.
 * Surfaces missing docs before the callable runs.
 */
export async function readPaymentDocsForMatch(
  rawMatchId: string,
): Promise<PaymentDocReadResult> {
  const matchId = decodeMatchId(rawMatchId);
  const uid = auth.currentUser?.uid ?? '';
  const matchPath = `matches/${matchId}`;
  const userPath = uid ? `users/${uid}` : 'users/';

  console.log('[PAYMENT PREFLIGHT]', {
    matchId,
    uid: uid || null,
    routerHint: 'food-share-pay/[matchId]',
  });

  const matchRead = await readDoc(matchPath);
  let sharePath: string | null = null;
  let shareExists: boolean | null = null;
  let shareData: Record<string, unknown> | null = null;

  if (matchRead.exists && matchRead.data) {
    const adminFoodShareId =
      typeof matchRead.data.adminFoodShareId === 'string'
        ? matchRead.data.adminFoodShareId.trim()
        : typeof matchRead.data.foodShareId === 'string'
          ? matchRead.data.foodShareId.trim()
          : '';
    console.log('[PAYMENT MATCH DATA]', matchPath, {
      matchId,
      lifecycle: matchRead.data.lifecycle ?? null,
      adminFoodShareId: adminFoodShareId || null,
      users: matchRead.data.users ?? null,
    });
    if (adminFoodShareId) {
      sharePath = `adminFoodShares/${adminFoodShareId}`;
      const shareRead = await readDoc(sharePath);
      shareExists = shareRead.exists;
      shareData = shareRead.data;
      if (!shareRead.exists) {
        console.error('[PAYMENT MISSING DOC]', sharePath, {
          matchId,
          adminFoodShareId,
          match: matchRead.data,
        });
      }
    } else {
      console.error('[PAYMENT MISSING DOC]', matchPath, {
        matchId,
        reason: 'match_missing_adminFoodShareId',
        match: matchRead.data,
      });
    }
  } else {
    console.error('[PAYMENT MISSING DOC]', matchPath, {
      matchId,
      uid: uid || null,
      reason: 'match_not_found_client_preflight',
    });
  }

  const userRead = uid ? await readDoc(userPath) : { exists: false, data: null };

  return {
    matchPath,
    matchExists: matchRead.exists,
    matchData: matchRead.data,
    sharePath,
    shareExists,
    shareData,
    userPath,
    userExists: userRead.exists,
  };
}

export function assertPaymentDocsReady(read: PaymentDocReadResult): void {
  if (!read.matchExists) {
    throw new Error(`Match not found at ${read.matchPath}`);
  }
  if (!read.sharePath || read.shareExists !== true) {
    throw new Error(
      read.sharePath
        ? `Food share not found at ${read.sharePath}`
        : 'Match is missing adminFoodShareId',
    );
  }
  if (read.shareData?.active !== true) {
    throw new Error(`Food share is not active at ${read.sharePath}`);
  }
}

export function parseCallableError(error: unknown): {
  code: string;
  message: string;
  details: unknown;
} {
  const err = error as {
    code?: string;
    message?: string;
    details?: unknown;
  };
  return {
    code: typeof err?.code === 'string' ? err.code : 'unknown',
    message: typeof err?.message === 'string' ? err.message : String(error),
    details: err?.details ?? null,
  };
}

/** True only when the Cloud Function itself is missing — not server "doc not found" errors. */
export function isCallableNotFound(error: unknown): boolean {
  const { code, message } = parseCallableError(error);
  if (code !== 'functions/not-found') return false;
  if (
    /match not found|food share not found|order not found|login required|not awaiting payment|not part of this match/i.test(
      message,
    )
  ) {
    return false;
  }
  return true;
}
