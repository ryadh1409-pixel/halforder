import { useAuth } from '@/services/AuthContext';
import { runAppLaunchLocationReconcile } from '@/services/location/appLaunchLocationReconcile';
import {
  BACKGROUND_GPS_REFRESH_AFTER_MS,
  markAppBackgrounded,
  runBackgroundLocationRefresh,
} from '@/services/location/backgroundLocationRefresh';
import React, { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

/**
 * Production location sync: one launch reconcile per user + silent GPS after
 * >5 min in background. No re-runs on re-render.
 */
export function AppLocationSync() {
  const { user, loading, roleResolved, role } = useAuth();
  const launchStartedForUidRef = useRef<string | null>(null);
  const authRef = useRef({ uid: '', role, loading, roleResolved });
  authRef.current = {
    uid: user?.uid?.trim() ?? '',
    role,
    loading,
    roleResolved,
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !roleResolved) return;

    const uid = user?.uid?.trim() ?? '';
    if (!uid) {
      launchStartedForUidRef.current = null;
      return;
    }

    if (launchStartedForUidRef.current === uid) return;
    launchStartedForUidRef.current = uid;

    void runAppLaunchLocationReconcile({ uid, role });
  }, [loading, roleResolved, role, user?.uid]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onChange = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        markAppBackgrounded();
        return;
      }

      if (next !== 'active') return;

      const { uid, role: r, loading: authLoading, roleResolved: resolved } =
        authRef.current;
      if (authLoading || !resolved || !uid) return;

      void runBackgroundLocationRefresh({ uid, role: r });
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return null;
}

export { BACKGROUND_GPS_REFRESH_AFTER_MS };
