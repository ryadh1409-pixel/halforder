import { useEffect } from 'react';

/** Dev-only: one [MOUNT] line per component + uid per session. */
const mountedKeys = new Set<string>();

export function resetDriverMountLogs(): void {
  mountedKeys.clear();
}

export function useDriverMountLog(componentName: string, uid?: string | null): void {
  const mountKey = `${componentName}:${uid?.trim() || 'no-uid'}`;

  useEffect(() => {
    if (!__DEV__) return undefined;
    if (mountedKeys.has(mountKey)) return undefined;
    mountedKeys.add(mountKey);
    console.log('[MOUNT]', componentName, uid?.trim() || 'no-uid');
    return () => {
      if (__DEV__) {
        console.log('[UNMOUNT]', componentName, uid?.trim() || 'no-uid');
      }
    };
  }, [componentName, mountKey, uid]);
}
