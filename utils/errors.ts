import { showError } from '@/utils/toast';

export type FriendlyErrorContext = 'default' | 'passwordReset';

export function isFirebaseAuthUserInvalidated(error: unknown): boolean {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    typeof (error as { code: unknown }).code !== 'string'
  ) {
    return false;
  }
  switch ((error as { code: string }).code) {
    case 'auth/user-not-found':
    case 'auth/user-disabled':
    case 'auth/user-token-expired':
    case 'auth/invalid-user-token':
    case 'auth/id-token-revoked':
      return true;
    default:
      return false;
  }
}

export function logError(error: unknown, context?: string): void {
  if (__DEV__) {
    if (context) {
      console.error(`[${context}]`, error);
    } else {
      console.error(error);
    }
  }
}

export function getFriendlyMessage(
  error: unknown,
  context: FriendlyErrorContext = 'default',
): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
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
      case 'auth/network-request-failed':
        return 'Check your connection and try again.';
      case 'auth/too-many-requests':
      case 'auth/quota-exceeded':
        return 'Too many attempts. Try again later.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters';
      default:
        return 'Something went wrong';
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return 'Something went wrong';
}

export function handleError(error: unknown, context?: string): string {
  logError(error, context);
  const message = getFriendlyMessage(error);
  showError(message);
  return message;
}

export const getUserFriendlyError = getFriendlyMessage;
