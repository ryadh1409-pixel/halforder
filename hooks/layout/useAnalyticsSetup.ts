import { ensureAuthReady } from '@/services/firebase';
import {
  updateLastActive,
  updateUserLocationInFirestore,
} from '@/services/radarAndPush';
import { trackAppOpen } from '@/services/analytics';
import { useEffect } from 'react';

export function useAnalyticsSetup(
  user: { uid?: string | null; email?: string | null } | null,
) {
  useEffect(() => {
    ensureAuthReady().catch(() => {});
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    updateLastActive(uid).catch(() => {});
    updateUserLocationInFirestore(uid, user?.email ?? null).catch(() => {});
    trackAppOpen(uid).catch(() => {});
  }, [user?.email, user?.uid]);
}
