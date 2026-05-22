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
  const listenerEpochRef = useRef(0);
  const presenceBootstrappedRef = useRef<string | null>(null);
  const pendingOnlineRef = useRef<boolean | null>(null);
  const togglingRef = useRef(false);

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
        const isOnlineLive = resolveDriverOnline(data);
        const pending = pendingOnlineRef.current;

        if (pending !== null) {
          if (isOnlineLive === pending) {
            setOnline(isOnlineLive);
            pendingOnlineRef.current = null;
          }
        } else {
          setOnline((prev) => (prev === isOnlineLive ? prev : isOnlineLive));
        }
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
      unsub();
    };
  }, [uid]);

  const setOnlineStatus = useCallback(
    async (nextValue: boolean) => {
      if (!uid || togglingRef.current) return;

      // eslint-disable-next-line no-console
      console.log('[TOGGLE PRESSED]', nextValue);

      togglingRef.current = true;
      setToggling(true);
      pendingOnlineRef.current = nextValue;
      setOnline(nextValue);

      try {
        await updateDriverOnlineStatus(uid, nextValue);
        if (!nextValue) {
          pendingOnlineRef.current = null;
        }
      } catch (error) {
        pendingOnlineRef.current = null;
        setOnline(!nextValue);
        throw error;
      } finally {
        togglingRef.current = false;
        setToggling(false);
      }
    },
    [uid],
  );

  return { online, loading, toggling, setOnlineStatus };
}
