import { useAuth } from '@/services/AuthContext';
import { startAppBadgeSync, stopAppBadgeSync } from '@/services/appBadgeManager';
import React, { useEffect } from 'react';

/**
 * Mount once at the app root. Keeps the OS app-icon badge equal to live unread totals.
 */
export function AppBadgeSync() {
  const { user, firestoreUserRole, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user?.uid) {
      stopAppBadgeSync();
      return;
    }

    startAppBadgeSync({ user, firestoreUserRole });
  }, [loading, user, firestoreUserRole]);

  useEffect(() => {
    return () => {
      stopAppBadgeSync();
    };
  }, []);

  return null;
}
