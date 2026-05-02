import { subscribeUserRole, type UserRole } from '../services/userService';
import { useEffect, useState } from 'react';

export function useUserRole(uid: string | null | undefined) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeUserRole(
      uid,
      (nextRole) => {
        setRole(nextRole);
        setLoading(false);
      },
      () => {
        setRole('user');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  return { role, loading };
}
