import { useAuth } from '@/services/AuthContext';
import { runAppLaunchLocationReconcile } from '@/services/location/appLaunchLocationReconcile';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * One fresh GPS reconcile per app session after auth + role resolve.
 * Does not run on web; does not re-run on re-renders.
 */
export function AppLaunchLocationSync() {
  const { user, loading, roleResolved, role } = useAuth();
  const startedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !roleResolved) return;

    const uid = user?.uid?.trim() ?? '';
    if (!uid) {
      startedForUidRef.current = null;
      return;
    }

    if (startedForUidRef.current === uid) return;
    startedForUidRef.current = uid;

    void runAppLaunchLocationReconcile({ uid, role });
  }, [loading, roleResolved, role, user?.uid]);

  return null;
}
