/**
 * @deprecated Prefer `utils/errorMessages` — kept for existing imports.
 */
import { extractErrorCode } from './errorMessages';

export {
  extractErrorCode,
  getReadableErrorMessage,
  getReadableErrorMessage as getUserFriendlyError,
  getReadableErrorMessageOr,
  type ReadableErrorContext,
  type ReadableErrorContext as FriendlyErrorContext,
} from './errorMessages';

/**
 * True when the server rejected the current session (deleted user, revoked token, etc.).
 * Do not sign out on `auth/network-request-failed` or similar transients.
 */
export function isFirebaseAuthUserInvalidated(error: unknown): boolean {
  const code = extractErrorCode(error);
  if (!code) return false;
  switch (code) {
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
