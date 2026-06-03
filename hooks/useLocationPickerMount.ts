import { useEffect, useRef, useState } from 'react';

import {
  claimProfileLocationBootstrap,
  profileLocationBootstrapKey,
} from '@/services/location/locationBootstrapGuard';
import { clearDeliveryLocationCache } from '@/services/location/locationLocalCache';
import type { AccountLocationCollection } from '@/types/savedLocation';

/**
 * One-time mount bootstrap: clear stale AsyncStorage only.
 * No GPS — live GPS runs only when the user taps "Use my current location".
 */
export function useLocationPickerMount(
  accountId: string | null,
  collection: AccountLocationCollection,
  onClearLocalState: () => void,
): boolean {
  const [mountReady, setMountReady] = useState(!accountId);
  const bootstrappedKeyRef = useRef<string | null>(null);
  const onClearRef = useRef(onClearLocalState);
  onClearRef.current = onClearLocalState;

  useEffect(() => {
    if (!accountId) {
      bootstrappedKeyRef.current = null;
      setMountReady(true);
      return undefined;
    }

    const bootstrapKey = profileLocationBootstrapKey(collection, accountId);
    if (bootstrappedKeyRef.current === bootstrapKey) {
      return undefined;
    }
    bootstrappedKeyRef.current = bootstrapKey;

    if (!claimProfileLocationBootstrap(bootstrapKey)) {
      setMountReady(true);
      return undefined;
    }

    setMountReady(false);
    let cancelled = false;
    void (async () => {
      await clearDeliveryLocationCache({ log: true, reason: 'profile_mount' });
      if (!cancelled) {
        onClearRef.current();
        setMountReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, collection]);

  return mountReady;
}
