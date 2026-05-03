import { subscribeUserRole, type UserRole } from '../services/userService';
import { useEffect, useMemo, useState } from 'react';

export function useUserRole(uid: string | null | undefined) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const unsub = subscribeUserRole(
        uid,
        (nextRole) => {
          setRole(nextRole);
          setLoading(false);
          setError(null);
        },
        () => {
          setRole('user');
          setLoading(false);
          setError(null);
        },
      );
      return () => unsub();
    } catch (e) {
      console.error('[useUserRole]', e);
      setRole('user');
      setLoading(false);
      setError('subscribe');
    }
  }, [uid]);

  return useMemo(
    () => ({
      role,
      loading,
      stale: false,
      error,
    }),
    [role, loading, error],
  );
}
