import {
  driverPresenceDoc,
  ensureDriverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '@/services/driverPresence';
import { onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useDriverOnlineStatus(driverId: string | null | undefined) {
  const uid = typeof driverId === 'string' ? driverId.trim() || null : null;
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const lastLogSignatureRef = useRef('');
  /** Bumped on each [uid] subscription so stale snapshot callbacks are ignored. */
  const listenerEpochRef = useRef(0);
  const presenceBootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setOnline(false);
      setLoading(false);
      return undefined;
    }

    const epoch = listenerEpochRef.current + 1;
    listenerEpochRef.current = epoch;
    const path = `drivers/${uid}`;
    const ref = driverPresenceDoc(uid);

    setLoading(true);

    if (presenceBootstrappedRef.current !== uid) {
      presenceBootstrappedRef.current = uid;
      void ensureDriverPresenceDoc(uid).catch((error) => {
        console.error('[ONLINE PRESENCE BOOTSTRAP ERROR]', { path, error });
      });
    }

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (listenerEpochRef.current !== epoch) return;

        const data = snap.data() as Record<string, unknown> | undefined;
        const resolved = snap.exists();
        const isOnlineLive = resolveDriverOnline(data);

        if (__DEV__) {
          const signature = JSON.stringify({
            exists: snap.exists(),
            online: data?.online,
            isOnline: data?.isOnline,
            resolved,
            isOnlineLive,
          });
          if (signature !== lastLogSignatureRef.current) {
            lastLogSignatureRef.current = signature;
            // eslint-disable-next-line no-console
            console.log('[ONLINE READ]', {
              path,
              online: data?.online,
              isOnline: data?.isOnline,
              resolved,
              isOnlineLive,
              exists: snap.exists(),
            });
          }
        }

        setOnline((prev) => (prev === isOnlineLive ? prev : isOnlineLive));
        setLoading((prev) => (prev ? false : prev));
      },
      (error) => {
        if (listenerEpochRef.current !== epoch) return;
        console.error('[ONLINE READ ERROR]', { path, error });
        setOnline((prev) => (prev ? false : prev));
        setLoading((prev) => (prev ? false : prev));
      },
    );

    return () => {
      if (listenerEpochRef.current === epoch) {
        listenerEpochRef.current = 0;
      }
      lastLogSignatureRef.current = '';
      unsub();
    };
  }, [uid]);

  const setOnlineStatus = useCallback(
    async (nextValue: boolean) => {
      if (!uid || toggling) return;
      setToggling(true);
      setOnline(nextValue);
      try {
        await updateDriverOnlineStatus(uid, nextValue);
      } catch (error) {
        console.error('[ONLINE WRITE ERROR]', { uid, nextValue, error });
        setOnline(!nextValue);
        throw error;
      } finally {
        setToggling(false);
      }
    },
    [uid, toggling],
  );

  return { online, loading, toggling, setOnlineStatus };
}
