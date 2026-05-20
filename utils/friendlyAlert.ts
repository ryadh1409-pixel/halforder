import { Alert } from 'react-native';

import { logError } from './errorLogger';
import {
  getReadableErrorMessage,
  type ReadableErrorContext,
} from './errorMessages';

/** Native alert with production-safe body copy. */
export function alertFriendly(
  title: string,
  error: unknown,
  context: ReadableErrorContext = 'default',
): void {
  logError(error);
  Alert.alert(title, getReadableErrorMessage(error, context));
}
