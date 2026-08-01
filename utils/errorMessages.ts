/**
 * Production user-facing error copy. Never expose Firebase codes, stacks, or SDK text.
 */

import { JOIN_ORDER_USER_FACING_MESSAGES } from '@/lib/joinOrderFirestore';

export type ReadableErrorContext =
  | 'default'
  | 'passwordReset'
  | 'upload'
  | 'payment'
  | 'order'
  | 'push'
  | 'customer'
  | 'driver'
  | 'restaurant'
  | 'foodShare';

const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

/** App-thrown errors with copy safe to show as-is. */
const SAFE_MESSAGE_EXACT = new Set([
  ...JOIN_ORDER_USER_FACING_MESSAGES,
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
  'This voucher is already in your wallet.',
  'Enter a promo code',
  'Promo code not found',
  'This promo is inactive.',
  'This promo has expired.',
  'This promo has reached its usage limit.',
  'This promo is not valid for this restaurant.',
  'Promo code required',
  'Sign in required.',
  'Message required',
  'Message is required',
  'Message cannot be empty',
  'Ticket not found',
  'Not your ticket',
  'No image selected.',
  'Invalid slide.',
  'Selected image is empty. Try another photo.',
  'Sign in to claim your Hi emooo gift.',
  'Restaurant not found.',
  'This restaurant is temporarily unavailable.',
  'Your driver account is suspended. Contact support.',
  'Enter a message',
  'Customer UID missing',
  'Notification body is required',
  'This meal share is no longer available.',
  'This meal share is not active.',
  'Order is not ready for pickup',
  'Order must be picked up before delivery',
  'Order not found',
  'Payment canceled.',
  'Payment is already in progress.',
  'Add card is available in the HalfOrder iOS / Android app.',
  'Could not save your location.',
  'Could not save your location. Please try again.',
  'Could not enable location.',
  'Could not update location.',
  'Could not open Stripe.',
  'Could not reach Emo AI right now.',
  'Emo went quiet for a second — try again?',
  'Could not unlock the gift right now. Try again.',
  'Google sign-in was cancelled.',
  'Google sign-in was canceled.',
  'Google sign-in is not ready yet.',
  'Apple Sign-In is not available on this device.',
  'Unable to sign in with Google. Please try again.',
  'Unable to sign in with Apple. Please try again.',
  'Location search unavailable. Please check API key.',
  'Payment failed. Please try again.',
  'Invalid promo code',
  'Failed to load reports',
  'Failed to generate report',
  'Failed to load report',
  'Archive failed',
  'Assistant unavailable. Please try again.',
  'AI backend request failed.',
  'Matches are temporarily unavailable. Try again in a moment.',
  'Turn on location to see smart nearby matches.',
  'Sign in to load smart matches from the directory.',
  'Could not load matches',
  'Could not refresh matches',
  'GPS found but address could not be resolved. Set your address in Profile.',
  'Opening Stripe…',
]);

/**
 * Anything matching this must never reach Alert / Toast / inline UI.
 * Technical details belong only in console / Crashlytics / internal logs.
 */
const TECHNICAL_MESSAGE_RE =
  /firebase|FirebaseError|firestore\/|auth\/|storage\/|functions\/|INTERNAL|PERMISSION_DENIED|stack trace|undefined is not|Cannot find native|Cannot read prop|Network request failed|Missing or insufficient|\bat\s+\w+[\s(/]|^\s*\{[\s\S]*"code"|EXPO_PUBLIC|id_token|identity token|REVERSED_CLIENT|GoogleService|clientSecret|checkoutUrl|checkoutSessionId|requestId|request_id|traceId|CodedError|NSError|RCTFatal|Hermes|Metro|expo-|native module|Deploy Firebase|Firestore Console|firebase deploy|permission-denied|invalid-argument|functions\/not-found|backend is not deployed|missing_id_token|Google sign-in failed:|Apple sign-in failed:|JSON\.parse|TypeError|ReferenceError|SyntaxError|RangeError|Error:|Exception|status code|HTTP\/|ECONN|ENOTFOUND|ETIMEDOUT|socket|SSL|TLS|NSURLError|CFNetwork|com\.google|com\.apple|Pods\/|node_modules|React Native|Invariant Violation|yellowbox|redbox/i;

function looksLikeExceptionOrDevCopy(message: string): boolean {
  const m = message.trim();
  if (!m) return true;
  if (TECHNICAL_MESSAGE_RE.test(m)) return true;
  if (m.includes('\n') && /at\s+\S+/.test(m)) return true;
  if (/[{}\[\]]/.test(m) && /"(code|message|stack|details)"/.test(m)) return true;
  if (/`[^`]+`/.test(m) && /firestore|deploy|index|function/i.test(m)) return true;
  if (/^[a-z]+\/[a-z0-9_-]+$/i.test(m)) return true;
  return false;
}

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
  if (looksLikeExceptionOrDevCopy(m)) return false;
  // Short human validation copy (e.g. "Please enter your email.") — never codes/stacks.
  if (
    m.length <= 160 &&
    !/\n/.test(m) &&
    !/[{}\[\]]/.test(m) &&
    /^[A-Za-z“"']/.test(m)
  ) {
    return true;
  }
  return false;
}

function messageFromKnownPhrase(message: string): string | null {
  const lower = message.toLowerCase();

  if (
    lower.includes('google sign-in') &&
    (lower.includes('cancel') || lower.includes('dismiss'))
  ) {
    return 'Google sign-in was canceled.';
  }
  if (
    lower.includes('google sign-in') ||
    lower.includes('missing id_token') ||
    lower.includes('expo_public_google') ||
    lower.includes('reversed_client')
  ) {
    return 'Unable to sign in with Google. Please try again.';
  }
  if (
    lower.includes('apple sign-in') ||
    lower.includes('identity token') ||
    lower.includes('usesapplesignin')
  ) {
    return 'Unable to sign in with Apple. Please try again.';
  }
  if (lower.includes('location') || lower.includes('gps') || lower.includes('places')) {
    if (lower.includes('permission') || lower.includes('denied')) {
      return 'Location permission is required. Enable it in Settings.';
    }
  }
  if (
    (lower.includes('deploy') && lower.includes('firebase')) ||
    lower.includes('firestore console') ||
    lower.includes('public_matchable_orders')
  ) {
    return 'Matches are temporarily unavailable. Try again in a moment.';
  }
  if (lower.includes('emo ai backend') || lower.includes('emoaichat')) {
    return 'Could not reach Emo AI right now.';
  }
  if (lower.includes('stripe') && lower.includes('open')) {
    return 'Could not open payment. Please try again.';
  }
  return null;
}

function messageForCode(code: string, context: ReadableErrorContext): string {
  const normalized = code.toLowerCase();

  switch (normalized) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Unable to sign in. Please check your details.';

    case 'auth/wrong-password':
      return 'Incorrect email or password.';

    case 'auth/user-not-found':
      return context === 'passwordReset'
        ? 'No account found for that email.'
        : 'Account not found.';

    case 'auth/email-already-in-use':
      return 'This email is already registered';

    case 'auth/network-request-failed':
    case 'network-request-failed':
      return 'Connection problem. Check your internet and try again.';

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
    case 'apple/canceled':
      return 'Sign-in was canceled.';

    case 'apple/request-failed':
      return 'Apple Sign-In failed. Please try again or use a different sign-in method.';

    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method.';

    case 'permission-denied':
    case 'firestore/permission-denied':
      if (context === 'customer' || context === 'order') {
        return 'We are having trouble updating your order. Please refresh and try again.';
      }
      if (context === 'driver') {
        return 'Unable to update delivery status. Please try again.';
      }
      if (context === 'restaurant') {
        return 'Unable to update order status. Please try again.';
      }
      return "We couldn't complete your request. Please try again.";
    case 'storage/unauthorized':
      return "We couldn't complete your request. Please try again.";

    case 'unavailable':
    case 'firestore/unavailable':
    case 'functions/unavailable':
      return 'Service is temporarily unavailable. Try again.';

    case 'deadline-exceeded':
    case 'firestore/deadline-exceeded':
      return 'Request timed out. Try again.';

    case 'cancelled':
    case 'canceled':
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
      return 'Unable to upload the file. Please try again.';

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
        return 'Connection problem. Check your internet and try again.';
      }
      if (normalized.includes('permission')) {
        if (context === 'customer' || context === 'order') {
          return 'We are having trouble updating your order. Please refresh and try again.';
        }
        if (context === 'driver') {
          return 'Unable to update delivery status. Please try again.';
        }
        if (context === 'restaurant') {
          return 'Unable to update order status. Please try again.';
        }
        return "We couldn't complete your request. Please try again.";
      }
      if (normalized.includes('auth/')) {
        return DEFAULT_MESSAGE;
      }
      return DEFAULT_MESSAGE;
  }
}

/**
 * Strip developer-facing copy from any string before it reaches the UI.
 */
export function sanitizeUserFacingMessage(
  message: string,
  fallback: string = DEFAULT_MESSAGE,
): string {
  const m = typeof message === 'string' ? message.trim() : '';
  if (!m) return fallback;
  if (isSafeAppMessage(m)) return m;
  const fromPhrase = messageFromKnownPhrase(m);
  if (fromPhrase) return fromPhrase;
  if (looksLikeExceptionOrDevCopy(m)) return fallback;
  if (m.length <= 160 && !/\n/.test(m) && !/[{}\[\]]/.test(m)) return m;
  return fallback;
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
    const fromPhrase = messageFromKnownPhrase(m);
    if (fromPhrase) return fromPhrase;
    if (isSafeAppMessage(m)) return m;
  }

  if (typeof error === 'string') {
    return sanitizeUserFacingMessage(error, DEFAULT_MESSAGE);
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
  if (error instanceof Error) {
    const m = error.message.trim();
    const fromPhrase = messageFromKnownPhrase(m);
    if (fromPhrase) return fromPhrase;
    if (isSafeAppMessage(m)) return m;
  }
  if (typeof error === 'string') {
    const sanitized = sanitizeUserFacingMessage(error, fallback);
    return sanitized;
  }
  return sanitizeUserFacingMessage(fallback, DEFAULT_MESSAGE);
}
