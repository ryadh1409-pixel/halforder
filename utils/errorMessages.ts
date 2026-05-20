/**
 * Production user-facing error copy. Never expose Firebase codes, stacks, or SDK text.
 */

export type ReadableErrorContext =
  | 'default'
  | 'passwordReset'
  | 'upload'
  | 'payment'
  | 'order'
  | 'push';

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

/** App-thrown errors with copy safe to show as-is. */
const SAFE_MESSAGE_EXACT = new Set([
  'Please sign in to complete payment',
  'Please enable photo access in Settings.',
  'Please enable camera access in Settings.',
  'Card not found',
  'Invalid card',
  'Sign in required',
  'Not authorized',
  'Could not load your profile to join.',
  'Could not load your profile to create this order.',
  'This card is not available',
  'This order is not open for joining',
  'This card has expired',
  'You cannot join your own card',
  'You cannot join this order due to a block.',
  'Order is full',
  'Host profile could not be loaded for this order.',
  'Order data out of sync. Try again shortly.',
  'You must be signed in to join an order.',
  'Order not found.',
  'Invalid order.',
  'Use the standard join flow for this order.',
  'Order no longer exists.',
  'Your account has been restricted. You cannot join orders.',
  'Order is already full.',
  'Order is not open',
  'Content not allowed',
  'Content not allowed.',
  'Unable to place order right now',
]);

const TECHNICAL_MESSAGE_RE =
  /firebase|FirebaseError|firestore\/|auth\/|storage\/|functions\/|INTERNAL|PERMISSION_DENIED|stack trace|undefined is not|Cannot read prop|Network request failed|Missing or insufficient|\bat\s+\w+[\s(/]|^\s*\{[\s\S]*"code"/i;

export function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const rec = error as Record<string, unknown>;
  if (typeof rec.code === 'string' && rec.code.trim()) {
    return rec.code.trim();
  }
  if (typeof rec.message === 'string') {
    const embedded = rec.message.match(
      /\b(?:auth|firestore|storage|functions)\/[a-z0-9-]+\b/i,
    );
    if (embedded) return embedded[0].toLowerCase();
  }
  return null;
}

function isSafeAppMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 220) return false;
  if (SAFE_MESSAGE_EXACT.has(m)) return true;
  if (TECHNICAL_MESSAGE_RE.test(m)) return false;
  if (/^PICKER_|^CAMERA_|^JOIN_ORDER_FIRESTORE/.test(m)) return false;
  return true;
}

function messageForCode(code: string, context: ReadableErrorContext): string {
  const normalized = code.toLowerCase();

  switch (normalized) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password';

    case 'auth/user-not-found':
      return context === 'passwordReset'
        ? 'No account found for that email.'
        : 'Account not found';

    case 'auth/email-already-in-use':
      return 'This email is already registered';

    case 'auth/network-request-failed':
      return 'Check your internet connection';

    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'Too many attempts. Try again later.';

    case 'auth/invalid-email':
      return 'Please enter a valid email address.';

    case 'auth/weak-password':
      return 'Password must be at least 6 characters';

    case 'auth/user-disabled':
      return 'This account has been disabled.';

    case 'auth/operation-not-allowed':
      return 'This sign-in method is not available.';

    case 'auth/requires-recent-login':
      return 'For security, please sign in again, then try again.';

    case 'auth/invalid-verification-code':
    case 'auth/invalid-verification-id':
    case 'auth/code-expired':
      return 'Invalid or expired code. Try again.';

    case 'auth/credential-already-in-use':
      return 'This account is already linked.';

    case 'auth/invalid-phone-number':
      return 'Enter a valid phone number.';

    case 'auth/missing-email':
      return 'Please enter your email.';

    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was canceled.';

    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method.';

    case 'permission-denied':
    case 'firestore/permission-denied':
      return context === 'order'
        ? 'Unable to place order right now'
        : "You don't have permission to do this";
    case 'storage/unauthorized':
      return "You don't have permission to do this";

    case 'unavailable':
    case 'firestore/unavailable':
    case 'functions/unavailable':
      return 'Service is temporarily unavailable. Try again.';

    case 'deadline-exceeded':
    case 'firestore/deadline-exceeded':
      return 'Request timed out. Try again.';

    case 'cancelled':
    case 'aborted':
      return 'Action was canceled.';

    case 'failed-precondition':
    case 'firestore/failed-precondition':
      return context === 'order'
        ? 'This action is not available right now.'
        : 'Something went wrong. Please try again.';

    case 'not-found':
    case 'firestore/not-found':
    case 'functions/not-found':
      return context === 'order' ? 'Order not found.' : DEFAULT_MESSAGE;

    case 'already-exists':
    case 'firestore/already-exists':
      return 'This already exists.';

    case 'resource-exhausted':
    case 'firestore/resource-exhausted':
      return 'Too many requests. Try again later.';

    case 'storage/object-not-found':
      return 'File not found.';

    case 'storage/canceled':
      return 'Upload was canceled.';

    case 'storage/retry-limit-exceeded':
    case 'storage/quota-exceeded':
      return context === 'upload'
        ? 'Upload failed. Try a smaller image.'
        : DEFAULT_MESSAGE;

    case 'storage/unknown':
    case 'storage/invalid-checksum':
      return context === 'upload'
        ? 'Upload failed. Please try again.'
        : DEFAULT_MESSAGE;

    case 'functions/unauthenticated':
      return 'Please sign in again.';

    case 'functions/internal':
    case 'internal':
      return DEFAULT_MESSAGE;

    case 'stripe/card_declined':
    case 'card_declined':
      return 'Your card was declined. Try another payment method.';

    case 'stripe/expired_card':
    case 'expired_card':
      return 'Your card has expired.';

    case 'stripe/incorrect_cvc':
      return 'Card security code is incorrect.';

    case 'stripe/processing_error':
      return 'Payment could not be processed. Try again.';

    default:
      if (normalized.includes('network') || normalized.includes('offline')) {
        return 'Check your internet connection';
      }
      if (normalized.includes('permission')) {
        return context === 'order'
          ? 'Unable to place order right now'
          : "You don't have permission to do this";
      }
      if (normalized.includes('auth/')) {
        return DEFAULT_MESSAGE;
      }
      return DEFAULT_MESSAGE;
  }
}

/**
 * Maps any thrown value to short, human copy safe for Alert / Toast / inline UI.
 */
export function getReadableErrorMessage(
  error: unknown,
  context: ReadableErrorContext = 'default',
): string {
  const code = extractErrorCode(error);
  if (code) {
    return messageForCode(code, context);
  }

  if (error instanceof Error && error.message) {
    const m = error.message.trim();
    if (isSafeAppMessage(m)) {
      return m;
    }
  }

  if (typeof error === 'string' && isSafeAppMessage(error)) {
    return error.trim();
  }

  return DEFAULT_MESSAGE;
}

/**
 * Uses {@link getReadableErrorMessage} when the error has a known code or safe app copy;
 * otherwise returns `fallback` (e.g. "Failed to load").
 */
export function getReadableErrorMessageOr(
  error: unknown,
  fallback: string,
  context: ReadableErrorContext = 'default',
): string {
  if (extractErrorCode(error)) {
    return getReadableErrorMessage(error, context);
  }
  if (error instanceof Error && isSafeAppMessage(error.message)) {
    return error.message.trim();
  }
  if (typeof error === 'string' && isSafeAppMessage(error)) {
    return error.trim();
  }
  return fallback;
}
