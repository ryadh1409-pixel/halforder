import { useEffect } from 'react';

/** Dev-only mount/unmount diagnostics for driver tree lifecycle. */
export function useDriverMountLog(componentName: string): void {
  useEffect(() => {
    if (__DEV__) {
      console.log('[MOUNT]', componentName);
    }
    return () => {
      if (__DEV__) {
        console.log('[UNMOUNT]', componentName);
      }
    };
  }, [componentName]);
}
