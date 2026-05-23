import { useEffect } from 'react';

const mountedComponents = new Set<string>();

export function resetDriverMountLogs(): void {
  mountedComponents.clear();
}

/**
 * Dev-only provider/layout lifecycle log (once per component name per session).
 *
 * In React StrictMode (web dev builds), effects run mount → cleanup → mount once.
 * You may see one [UNMOUNT] immediately followed by [MOUNT] — that is expected dev-only
 * behavior and does not occur in production builds without StrictMode.
 */
export function useDriverMountLog(componentName: string, uid?: string | null): void {
  useEffect(() => {
    if (!__DEV__) return undefined;

    const globalKey = componentName;
    const isFirstGlobalMount = !mountedComponents.has(globalKey);
    if (isFirstGlobalMount) {
      mountedComponents.add(globalKey);
    }

    console.log(
      '[MOUNT]',
      componentName,
      uid?.trim() || '',
      isFirstGlobalMount ? '' : '(strict-mode remount)',
    );

    return () => {
      if (!__DEV__) return;
      console.log('[UNMOUNT]', componentName, uid?.trim() || '');
      // Keep globalKey in set so StrictMode remount is labeled, not double-counted as new session
    };
  }, [componentName, uid]);
}
