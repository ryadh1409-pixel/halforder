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
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';

type State = {
  restaurants: HomeRestaurant[];
  loading: boolean;
  error: string | null;
};

/** Realtime Firestore `restaurants` list for marketplace home (live GPS distances). */
export function useHomeRestaurants(): State {
  const { userCoords, locationReady } = useHomeMarketplaceLocation();
  // Keep coords in a ref so the snapshot callback always reads the latest
  // value without needing to recreate the Firestore listener on every GPS update.
  const userCoordsRef = useRef(userCoords);
  useEffect(() => { userCoordsRef.current = userCoords; }, [userCoords]);

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
      filters: { op: 'onSnapshot', query: 'collection(restaurants).limit(50)' },
    });

    setLoading(true);
    // Cap at 50 restaurants — prevents unbounded reads as the catalogue grows.
    const q = query(collection(db, 'restaurants'), limit(50));
    unsub = onSnapshot(
      q,
      (snap) => {
        const coords = userCoordsRef.current;
        const rows = snap.docs
          .map((d) => {
            const raw = d.data() as Record<string, unknown>;
            if (raw.adminEnabled === false) return null;
            const normalized = normalizeRestaurantFirestoreDoc(d.id, raw);
            const mapped = mapFirestoreRestaurant(d.id, normalized, coords);
            // Hide restaurants without valid coordinates (no broken placeholder cards).
            if (!mapped.normalizedCoords) return null;
            return mapped;
          })
          .filter((r): r is HomeRestaurant => r != null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationReady]); // ← intentionally omit userCoords: coords go through the ref

  return { restaurants, loading, error };
}
