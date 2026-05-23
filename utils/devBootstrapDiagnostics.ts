import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Dev-only bootstrap diagnostics.
 *
 * StrictMode status:
 * - Main Expo app (`package.json` → `expo-router/entry`): React.StrictMode is NOT in the tree.
 * - Legal web Vite app (`src/main.tsx`): StrictMode wraps the legal site only — not the mobile app.
 * - React Native / Expo dev may still remount layouts once during hydration or fast refresh.
 *
 * A single quick mount→unmount→mount in dev is usually expected; repeated cycles indicate an app bug.
 */

const mountCounts = new Map<string, number>();
let startupLogged = false;

export function logDevStartupConfig(): void {
  if (!__DEV__ || startupLogged) return;
  startupLogged = true;
  console.log('[DEV STARTUP]', {
    entry: 'expo-router/entry',
    platform: Platform.OS,
    strictModeInExpoAppTree: false,
    strictModeWebLegalSiteOnly: true,
    reactCompiler: true,
    note:
      'Expo app has no StrictMode wrapper. One dev remount may still occur from Router hydration or Fast Refresh.',
  });
}

export function getDevProviderMountCount(name: string): number {
  return mountCounts.get(name) ?? 0;
}

export function useDevProviderMount(providerName: string): void {
  useEffect(() => {
    if (!__DEV__) return undefined;

    const instance = (mountCounts.get(providerName) ?? 0) + 1;
    mountCounts.set(providerName, instance);
    const mountedAt = Date.now();

    console.log('[DEV MOUNT]', providerName, { instance, totalSessionMounts: instance });

    return () => {
      const heldMs = Date.now() - mountedAt;
      console.log('[DEV UNMOUNT]', providerName, { instance, heldMs });

      if (instance === 1 && heldMs < 400) {
        console.log(
          '[DEV DIAG]',
          providerName,
          'quick first unmount — common in dev (hydration / fast refresh); production builds typically mount once.',
        );
      }
      if (instance > 2) {
        console.warn(
          '[DEV DIAG]',
          providerName,
          `mounted ${instance} times this session — investigate app remount logic (not normal StrictMode).`,
        );
      }
    };
  }, [providerName]);
}

export function resetDevProviderMountCounts(): void {
  mountCounts.clear();
}
