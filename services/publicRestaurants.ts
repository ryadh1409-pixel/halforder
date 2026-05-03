/**
 * Read-only listing of venues for discovery (Food Trucks tab, etc.).
 */
import { db } from './firebase';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

export type PublicRestaurantRow = {
  id: string;
  name: string;
  image: string | null;
  location: string;
  isOpen: boolean;
};

const MAX_LIST = 48;

function mapDocToRow(d: { id: string; data: () => Record<string, unknown> }): PublicRestaurantRow {
  const data = d.data();
  return {
    id: d.id,
    name:
      typeof data.name === 'string' && data.name.trim()
        ? data.name.trim()
        : 'Venue',
    image: typeof data.logo === 'string' && data.logo.trim() ? data.logo.trim() : null,
    location:
      typeof data.location === 'string' && data.location.trim()
        ? data.location.trim()
        : '',
    isOpen: data.isOpen !== false,
  };
}

/** One-shot fetch (e.g. Food Trucks tab). Prefer with pull-to-refresh / focus. */
export async function fetchPublicRestaurants(): Promise<PublicRestaurantRow[]> {
  const snap = await getDocs(query(collection(db, 'restaurants'), limit(MAX_LIST)));
  const rows = snap.docs.map((docSnap) =>
    mapDocToRow({ id: docSnap.id, data: () => docSnap.data() }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function subscribePublicRestaurants(
  onData: (rows: PublicRestaurantRow[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'restaurants'), limit(MAX_LIST));
  return onSnapshot(
    q,
    (snap) => {
      const rows: PublicRestaurantRow[] = snap.docs.map((d) =>
        mapDocToRow({ id: d.id, data: () => d.data() }),
      );
      rows.sort((a, b) => a.name.localeCompare(b.name));
      onData(rows);
    },
    (e) => {
      console.warn('[publicRestaurants] snapshot', e);
      onError?.(e instanceof Error ? e : new Error('Failed to load venues'));
      onData([]);
    },
  );
}
