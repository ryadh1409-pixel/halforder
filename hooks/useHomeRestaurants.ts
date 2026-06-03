import {
  useHomeMarketplaceLocation,
} from '@/contexts/HomeMarketplaceLocationContext';
import { db } from '@/services/firebase';
import {
  beginFirestoreQuery,
  logFirestoreQueryFailed,
} from '@/services/firestoreQueryDiagnostics';
import { normalizeRestaurantFirestoreDoc } from '@/lib/location/normalizeRestaurantDoc';
import { mapFirestoreRestaurant, type HomeRestaurant } from '@/types/homeRestaurant';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

type State = {
  restaurants: HomeRestaurant[];
  loading: boolean;
  error: string | null;
};

/** Realtime Firestore `restaurants` list for marketplace home (live GPS distances). */
export function useHomeRestaurants(): State {
  const { userCoords, locationReady } = useHomeMarketplaceLocation();
  const [restaurants, setRestaurants] = useState<HomeRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationReady) return undefined;

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
        const rows = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          if (__DEV__) {
            console.log('[RAW RESTAURANT]', { id: d.id, ...raw });
          }
          const normalized = normalizeRestaurantFirestoreDoc(d.id, raw);
          return mapFirestoreRestaurant(d.id, normalized, userCoords);
        });
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
  }, [userCoords, locationReady]);

  return { restaurants, loading, error };
}
