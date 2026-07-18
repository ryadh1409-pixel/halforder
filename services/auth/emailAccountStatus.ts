import { auth } from '@/services/firebase';
import { fetchSignInMethodsForEmail } from 'firebase/auth';

export type AuthEmailAccountStatus = 'exists' | 'available';

function getAuthApiKey(): string {
  const key = auth.app?.options?.apiKey;
  return typeof key === 'string' ? key.trim() : '';
}

/**
 * Best-effort check whether Firebase Auth already has an account for this email.
 * Uses fetchSignInMethodsForEmail, then Identity Toolkit createAuthUri as fallback
 * (needed when sign-in methods are empty under some Auth settings).
 */
export async function resolveAuthEmailAccountStatus(
  email: string,
): Promise<AuthEmailAccountStatus> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return 'available';

  try {
    const methods = await fetchSignInMethodsForEmail(auth, trimmed);
    if (methods.length > 0) return 'exists';
  } catch {
    // Fall through to createAuthUri probe.
  }

  const apiKey = getAuthApiKey();
  if (!apiKey) return 'available';

  try {
    const continueUri =
      typeof auth.app?.options?.authDomain === 'string' &&
      auth.app.options.authDomain.trim()
        ? `https://${auth.app.options.authDomain.trim()}`
        : 'https://halforfer.firebaseapp.com';

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: trimmed,
          continueUri,
        }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        registered?: boolean;
        signinMethods?: unknown;
      };
      if (data.registered === true) return 'exists';
      if (Array.isArray(data.signinMethods) && data.signinMethods.length > 0) {
        return 'exists';
      }
    }
  } catch {
    // Fall through to password probe.
  }

  // When enumeration protection is off, a bogus password distinguishes
  // EMAIL_NOT_FOUND (available) from INVALID_PASSWORD (exists).
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          password: `__halforder_probe_${Date.now()}__`,
          returnSecureToken: false,
        }),
      },
    );
    const data = (await res.json()) as {
      error?: { message?: string };
    };
    const message = String(data.error?.message ?? '').toUpperCase();
    if (
      message.includes('EMAIL_NOT_FOUND') ||
      message.includes('USER_NOT_FOUND')
    ) {
      return 'available';
    }
    if (
      message.includes('INVALID_PASSWORD') ||
      message.includes('INVALID_LOGIN_CREDENTIALS') ||
      message.includes('INVALID_CREDENTIAL')
    ) {
      // INVALID_LOGIN_CREDENTIALS is ambiguous when enumeration protection is on.
      // Prefer "exists" only for classic INVALID_PASSWORD.
      if (message.includes('INVALID_PASSWORD')) return 'exists';
    }
  } catch {
    // Treat as available; registration still catches email-already-in-use.
  }

  return 'available';
}

export function getFirebaseAuthErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

/** Friendly copy for auth signup / continue failures (auth UI only). */
export function getAuthFlowFriendlyMessage(err: unknown): string {
  const code = getFirebaseAuthErrorCode(err);
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email already has an account. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Connection problem. Check your internet and try again.';
    default: {
      if (err instanceof Error && err.message.trim()) {
        const msg = err.message.trim();
        if (/email-already-in-use/i.test(msg) || /already.*account/i.test(msg)) {
          return 'This email already has an account. Please sign in instead.';
        }
        if (/invalid-email/i.test(msg)) {
          return 'Please enter a valid email address.';
        }
        if (/weak-password/i.test(msg)) {
          return 'Password must be at least 6 characters.';
        }
        if (/network-request-failed/i.test(msg)) {
          return 'Connection problem. Check your internet and try again.';
        }
        // Avoid flashing raw Firebase codes / stacks.
        if (!/^auth\//i.test(msg) && !/FirebaseError/i.test(msg)) {
          return msg;
        }
      }
      return 'Something went wrong. Please try again.';
    }
  }
}

export function isEmailAlreadyInUseError(err: unknown): boolean {
  const code = getFirebaseAuthErrorCode(err);
  if (code === 'auth/email-already-in-use') return true;
  if (err instanceof Error) {
    return (
      /email-already-in-use/i.test(err.message) ||
      /already has an account/i.test(err.message) ||
      /already registered/i.test(err.message)
    );
  }
  return false;
}

/** Preserve Firebase Auth `code` when rethrowing as Error. */
export function throwAuthFlowError(err: unknown): never {
  const code = getFirebaseAuthErrorCode(err);
  const message = getAuthFlowFriendlyMessage(err);
  const wrapped = new Error(message) as Error & { code?: string };
  if (code) wrapped.code = code;
  throw wrapped;
}
