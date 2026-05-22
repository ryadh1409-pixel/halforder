import type { FirestoreError } from 'firebase/firestore';

type SnapshotErrorHandler = (error: FirestoreError) => void;

/**
 * Wraps Firestore listener error callbacks so failures never surface as
 * unhandled promise rejections in React Native / Expo.
 */
export function safeListenerError(
  context: string,
  onError?: SnapshotErrorHandler,
): SnapshotErrorHandler {
  return (error: FirestoreError) => {
    try {
      onError?.(error);
    } catch (handlerErr) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[firestore] listener error handler failed', {
          context,
          handlerErr,
        });
      }
    }
  };
}

/** Runs async listener bootstrap without uncaught rejections. */
export function runListenerBootstrap(
  context: string,
  bootstrap: () => Promise<void>,
  onBootstrapError?: (err: unknown) => void,
): void {
  void bootstrap().catch((err) => {
    try {
      onBootstrapError?.(err);
    } catch {
      /* ignore */
    }
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[firestore] listener bootstrap failed', { context, err });
    }
  });
}
