import {
  driverPresenceDoc,
  logDriverPresenceRead,
  resolveDriverOnline,
  writeDriverOnlinePresence,
} from '@/services/driverPresence';
import { auth } from '@/services/firebase';
import { onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type UseDriverPresenceOptions = {
  enabled?: boolean;
  displayName?: string | null;
};

/**
 * Canonical driver online presence: single Firestore listener + optimistic toggle.
 * Bootstrap `ensureDriverPresenceDoc` runs in DriverPresenceProvider, not here.
 */
export function useDriverPresence(
  driverId: string | null | undefined,
  options: UseDriverPresenceOptions = {},
) {
  const uid = typeof driverId === 'string' ? driverId.trim() || null : null;
  const enabled = options.enabled !== false;
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const listenerEpochRef = useRef(0);
  const togglingRef = useRef(false);
  const pendingOnlineRef = useRef<boolean | null>(null);
  const lastResolvedRef = useRef<boolean | null>(null);
  const [rating, setRating] = useState(5.0);

  useEffect(() => {
    if (!uid || !enabled) {
      setIsOnline(false);
      setLoading(false);
      return undefined;
    }

    const epoch = listenerEpochRef.current + 1;
    listenerEpochRef.current = epoch;
    const path = `drivers/${uid}`;

    setLoading(true);

    const unsub = onSnapshot(
      driverPresenceDoc(uid),
      (snap) => {
        if (listenerEpochRef.current !== epoch) return;

        const data = snap.data() as Record<string, unknown> | undefined;
        const resolved = resolveDriverOnline(data);
        const pending = pendingOnlineRef.current;

        if (pending !== null && resolved !== pending) {
          return;
        }
        if (pending !== null && resolved === pending) {
          pendingOnlineRef.current = null;
        }

        if (lastResolvedRef.current !== resolved) {
          lastResolvedRef.current = resolved;
          logDriverPresenceRead(path, data, resolved);
        }

        setIsOnline((prev) => (prev === resolved ? prev : resolved));
        setLoading(false);

        if (snap.exists()) {
          const nextRating =
            typeof data?.rating === 'number' &&
            Number.isFinite(data.rating) &&
            data.rating > 0
              ? data.rating
              : 5.0;
          setRating((prev) => (prev === nextRating ? prev : nextRating));
        }
      },
      (error) => {
        if (listenerEpochRef.current !== epoch) return;
        console.error('[ONLINE READ ERROR]', { path, error });
        setLoading(false);
      },
    );

    return () => {
      if (listenerEpochRef.current === epoch) {
        listenerEpochRef.current = 0;
      }
      unsub();
    };
  }, [uid, enabled]);

  const setOnlineStatus = useCallback(async (nextValue: boolean) => {
    if (togglingRef.current) return;

    const authUid = auth.currentUser?.uid?.trim() ?? null;
    if (!authUid) {
      console.error('[ONLINE WRITE ERROR] no auth.currentUser');
      throw new Error('Not signed in');
    }

    console.log('[TOGGLE PRESSED]', { nextValue, uid: authUid });

    togglingRef.current = true;
    pendingOnlineRef.current = nextValue;
    setToggling(true);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    lastResolvedRef.current = nextValue;
    setIsOnline(nextValue);

    try {
      await writeDriverOnlinePresence(nextValue);
    } catch (error) {
      pendingOnlineRef.current = null;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const reverted = !nextValue;
      lastResolvedRef.current = reverted;
      setIsOnline(reverted);
      console.error('[ONLINE WRITE ERROR]', error);
      throw error;
    } finally {
      togglingRef.current = false;
      setToggling(false);
    }
  }, []);

  return {
    isOnline,
    loading,
    toggling,
    rating,
    setOnlineStatus,
    toggleOnline: setOnlineStatus,
  };
}
