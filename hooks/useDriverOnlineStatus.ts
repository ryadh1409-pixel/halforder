import { db } from '@/services/firebase';
import { DRIVER_PRESENCE_COLLECTION, driverPresenceDoc } from '@/services/driverDispatch';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export function useDriverOnlineStatus(driverId: string | null | undefined) {
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) {
      setOnline(false);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      driverPresenceDoc(driverId),
      (snap) => {
        const data = snap.data();
        const resolvedIsOnline = data?.isOnline === true;
        console.log('[ONLINE READ]', {
          driverId,
          path: `${DRIVER_PRESENCE_COLLECTION}/${driverId}`,
          snapshot: data ?? null,
          resolvedIsOnline,
        });
        setOnline(resolvedIsOnline);
        setLoading(false);
      },
      () => {
        setOnline(false);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [driverId]);

  return { online, loading };
}
