import { Alert } from 'react-native';

import { logError } from '@/utils/errorLogger';
import { showError } from '@/utils/toast';

import {
  getUserFriendlyError,
  type UserFriendlyErrorOptions,
} from './userFriendlyErrors';
import type { ReadableErrorContext } from '@/utils/errorMessages';

/**
 * Logs the full error for developers, then shows friendly copy to users.
 */
export function showUserError(
  error: unknown,
  options?: UserFriendlyErrorOptions | ReadableErrorContext,
): void {
  logError(error);
  const message = getUserFriendlyError(error, options);

  const opts =
    typeof options === 'string' ? { context: options } : (options ?? {});

  if (opts.useAlert) {
    Alert.alert(opts.alertTitle ?? 'Error', message);
    return;
  }

  showError(message);
}
