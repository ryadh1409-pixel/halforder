import { Alert } from 'react-native';

import { logError } from './errorLogger';
import {
  getUserFriendlyError,
  type UserFriendlyErrorOptions,
} from '@/services/errors/userFriendlyErrors';
import type { ReadableErrorContext } from './errorMessages';

/** Native alert with production-safe body copy. */
export function alertFriendly(
  title: string,
  error: unknown,
  context: UserFriendlyErrorOptions | ReadableErrorContext = 'default',
): void {
  logError(error);
  const message =
    typeof context === 'string'
      ? getUserFriendlyError(error, { context })
      : getUserFriendlyError(error, context);
  Alert.alert(title, message);
}
