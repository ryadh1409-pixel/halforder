/**
 * @deprecated Prefer `services/errors/userFriendlyErrors` — kept for existing imports.
 */
import { extractErrorCode } from './errorMessages';

export {
  extractErrorCode,
  getReadableErrorMessage,
  getReadableErrorMessageOr,
  type ReadableErrorContext,
  type ReadableErrorContext as FriendlyErrorContext,
} from './errorMessages';

export {
  getUserFriendlyError,
  ROLE_ORDER_UPDATE_ERROR,
  type UserFriendlyErrorOptions,
  type UserRole,
} from '@/services/errors/userFriendlyErrors';

export { showUserError } from '@/services/errors/showUserError';

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

/** @deprecated Use `getUserFriendlyError` from `services/errors/userFriendlyErrors`. */
export { getReadableErrorMessage as getUserFriendlyErrorLegacy } from './errorMessages';
