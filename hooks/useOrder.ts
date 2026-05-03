import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { db } from '../services/firebase';

/**
 * Live `orders/{orderId}` document snapshot.
 */
export function useOrder(orderId: string) {
  const oid = orderId.trim();
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(!!oid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oid) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const ref = doc(db, 'orders', oid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSnapshot(snap);
        setLoading(false);
        setError(null);
      },
      () => {
        setSnapshot(null);
        setLoading(false);
        setError(null);
      },
    );
    return () => unsub();
  }, [oid]);

  return useMemo(
    () => ({
      snapshot,
      loading,
      stale: false,
      error,
    }),
    [snapshot, loading, error],
  );
}
