import { db } from '@/services/firebase';
import {
  beginFirestoreQuery,
  logFirestoreQueryFailed,
} from '@/services/firestoreQueryDiagnostics';
import { getUserLocationSafe } from '@/services/location';
import { mapFirestoreRestaurant, type HomeRestaurant } from '@/types/homeRestaurant';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

type State = {
  restaurants: HomeRestaurant[];
  loading: boolean;
  error: string | null;
};

/** Realtime Firestore `restaurants` list for marketplace home. */
export function useHomeRestaurants(): State {
  const [restaurants, setRestaurants] = useState<HomeRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loc = await getUserLocationSafe();
      if (cancelled) return;
      if (loc) setUserCoords({ lat: loc.latitude, lng: loc.longitude });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const promiseId = beginFirestoreQuery({
      file: 'hooks/useHomeRestaurants.ts',
      listener: 'useHomeRestaurants.restaurants',
      collection: 'restaurants',
      filters: { op: 'onSnapshot', query: 'collection(restaurants)' },
    });

    setLoading(true);
    const q = query(collection(db, 'restaurants'));
    unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) =>
          mapFirestoreRestaurant(
            d.id,
            d.data() as Record<string, unknown>,
            userCoords,
          ),
        );
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setRestaurants(rows);
        setError(null);
        setLoading(false);
      },
      (err) => {
        logFirestoreQueryFailed(
          promiseId,
          'useHomeRestaurants.restaurants',
          err,
        );
        if (__DEV__) console.warn('[useHomeRestaurants]', err);
        setError('Could not load restaurants');
        setRestaurants([]);
        setLoading(false);
      },
    );

    return () => unsub?.();
  }, [userCoords]);

  return { restaurants, loading, error };
}
