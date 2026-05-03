import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { auth, db } from '../services/firebase';
import { mapRawUserDocument, type PublicUserFields } from '../services/users';

/**
 * Live Firestore profile for the signed-in user (`users/{uid}`).
 */
export function useCurrentUser() {
  const uid = auth.currentUser?.uid ?? null;
  const [profile, setProfile] = useState<PublicUserFields | null>(null);
  const [loading, setLoading] = useState(!!uid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const ref = doc(db, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        try {
          if (!snap.exists()) {
            setProfile(null);
            setLoading(false);
            setError(null);
            return;
          }
          setProfile(
            mapRawUserDocument(uid, snap.data() as Record<string, unknown>),
          );
          setLoading(false);
          setError(null);
        } catch (e) {
          console.error('[useCurrentUser]', e);
          setProfile(null);
          setLoading(false);
          setError('parse');
        }
      },
      () => {
        setProfile(null);
        setLoading(false);
        setError(null);
      },
    );
    return () => unsub();
  }, [uid]);

  return useMemo(
    () => ({
      uid,
      profile,
      loading,
      stale: false,
      error,
    }),
    [uid, profile, loading, error],
  );
}
