import { Alert } from 'react-native';

type LogErrorOptions = {
  /** When true (default), show an alert. Set false when caller shows its own. */
  alert?: boolean;
};

/**
 * Global error logger for HalfOrder. Logs the real error to console
 * and optionally shows a user-facing alert so crashes are not silent.
 */
export function logError(error: unknown, options?: LogErrorOptions): void {
  console.error('HalfOrder Error:', error);

  const showAlert = options?.alert !== false;

  if (!showAlert) return;

  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: string }).message)
      : null;

  if (message) {
    Alert.alert('Error', message);
  } else {
    Alert.alert('Error', 'Unexpected error occurred');
  }
}
