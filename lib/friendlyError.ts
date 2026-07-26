import { USER_ERROR_GENERIC } from './userFacingErrors';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';

/**
 * Maps unknown errors to a single safe string for alerts (no Firebase codes or stack text).
 */
export function friendlyErrorMessage(error: unknown): string {
  return getUserFriendlyError(error, { fallback: USER_ERROR_GENERIC });
}
