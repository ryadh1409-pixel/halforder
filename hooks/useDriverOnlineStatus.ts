import {
  driverPresenceDoc,
  resolveDriverOnline,
  updateDriverOnlineStatus,
} from '@/services/driverPresence';
import { onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';

export function useDriverOnlineStatus(driverId: string | null | undefined) {
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

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
      (snap) => {
        const data = snap.data();
        const resolved = resolveDriverOnline(data);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[ONLINE READ]', {
            path,
            online: data?.online,
            isOnline: data?.isOnline,
            resolved,
            exists: snap.exists(),
          });
        }
        setOnline(resolved);
        setLoading(false);
      },
      (error) => {
        console.error('[ONLINE READ ERROR]', { path, error });
        setOnline(false);
        setLoading(false);
      },
    );

    return () => unsub();
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
