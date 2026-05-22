import {
  driverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '@/services/driverPresence';
import { onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useDriverOnlineStatus(driverId: string | null | undefined) {
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const lastLogSignatureRef = useRef('');

  useEffect(() => {
    if (!driverId) {
      setOnline(false);
      setLoading(false);
      return;
    }

    const ref = driverPresenceDoc(driverId);
    const path = `drivers/${driverId}`;

    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: __DEV__ },
      (snap) => {
        const data = snap.data() as Record<string, unknown> | undefined;
        const resolvedOnline = resolveDriverOnline(data);

        if (__DEV__) {
          const signature = JSON.stringify({
            exists: snap.exists(),
            online: data?.online,
            isOnline: data?.isOnline,
            resolvedOnline,
            fromCache: snap.metadata.fromCache,
            hasPendingWrites: snap.metadata.hasPendingWrites,
          });
          if (signature !== lastLogSignatureRef.current) {
            lastLogSignatureRef.current = signature;
            // eslint-disable-next-line no-console
            console.log('[ONLINE READ]', {
              path,
              online: data?.online,
              isOnline: data?.isOnline,
              resolvedOnline,
              exists: snap.exists(),
              fromCache: snap.metadata.fromCache,
              hasPendingWrites: snap.metadata.hasPendingWrites,
            });
          }
        }

        setOnline(resolvedOnline);
        setLoading(false);
      },
      (error) => {
        console.error('[ONLINE READ ERROR]', { path, error });
        setOnline(false);
        setLoading(false);
      },
    );

    return () => {
      lastLogSignatureRef.current = '';
      unsub();
    };
  }, [driverId]);

  const setOnlineStatus = useCallback(
    async (nextValue: boolean) => {
      if (!driverId || toggling) return;
      setToggling(true);
      setOnline(nextValue);
      try {
        await updateDriverOnlineStatus(driverId, nextValue);
      } catch (error) {
        console.error('[ONLINE WRITE ERROR]', { uid: driverId, nextValue, error });
        setOnline(!nextValue);
        throw error;
      } finally {
        setToggling(false);
      }
    },
    [driverId, toggling],
  );

  return { online, loading, toggling, setOnlineStatus };
}
