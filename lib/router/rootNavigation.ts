/**
 * Defer navigation until after the root layout commit cycle.
 * Prevents "navigate before mounting Root Layout" from nested layout timing.
 */
export function runRootNavigationTask(task: () => void): void {
  setTimeout(() => {
    try {
      task();
    } catch (error) {
      if (__DEV__) {
        console.warn('[root-navigation] deferred navigation failed', error);
      }
    }
  }, 0);
}
