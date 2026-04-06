/**
 * Maps Firebase / SDK errors to short, non-technical copy.
 * Never pass through raw `error.message`, stack traces, or FirebaseError strings.
 */

export type FriendlyErrorContext = 'default' | 'passwordReset';

function isSafeAppMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 200) return false;
  if (
    /firebase|FirebaseError|INTERNAL|stack trace|insufficient permissions|Missing or insufficient|\bat\s+\w+[\s(/]/i.test(
      m,
    )
  ) {
    return false;
  }
  return true;
}

function messageFromAuthCode(
  code: string,
  context: FriendlyErrorContext,
): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered';

    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password';

    case 'auth/user-not-found':
      return context === 'passwordReset'
        ? 'No account found for that email.'
        : 'Incorrect email or password';

    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';

    case 'auth/invalid-email':
      return 'Please enter a valid email address.';

    case 'auth/weak-password':
      return 'Password must be at least 6 characters';

    case 'auth/network-request-failed':
      return 'Check your connection and try again.';

    case 'auth/user-disabled':
      return 'This account has been disabled.';

    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available.';

    case 'auth/requires-recent-login':
      return 'For security, please sign out, sign in again, then try again.';

    case 'auth/invalid-verification-code':
    case 'auth/invalid-verification-id':
      return 'Invalid or expired code. Try again.';

    case 'auth/credential-already-in-use':
      return 'This account is already linked.';

    case 'auth/invalid-phone-number':
      return 'Enter a valid phone number.';

    case 'auth/quota-exceeded':
      return 'Too many attempts. Try again later.';

    case 'permission-denied':
    case 'firestore/permission-denied':
    case 'unavailable':
    case 'failed-precondition':
    case 'deadline-exceeded':
    case 'cancelled':
    case 'aborted':
      return 'Something went wrong';

    default:
      return 'Something went wrong';
  }
}

/**
 * Returns user-facing error copy. Safe to show in Text / Alert body.
 */
export function getUserFriendlyError(
  error: unknown,
  context: FriendlyErrorContext = 'default',
): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    return messageFromAuthCode(String((error as { code: string }).code), context);
  }

  if (error instanceof Error && error.message) {
    const m = error.message.trim();
    if (isSafeAppMessage(m)) {
      return m;
    }
  }

  return 'Something went wrong';
}
