import {
  driverPresenceDoc,
  ensureDriverPresenceDoc,
  logDriverPresenceRead,
  resolveDriverOnline,
  updateDriverOnlineStatus,
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
  const bootstrappedRef = useRef<string | null>(null);
  const [rating, setRating] = useState(5.0);

  useEffect(() => {
    if (!uid || !enabled) {
      setIsOnline(false);
      setLoading(false);
      return undefined;
    }

    if (bootstrappedRef.current !== uid) {
      bootstrappedRef.current = uid;
      void ensureDriverPresenceDoc(uid, options.displayName).catch((error) => {
        console.error('[driver] ensureDriverPresenceDoc failed', error);
        bootstrappedRef.current = null;
      });
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

        if (pending !== null) {
          if (resolved !== pending) return;
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
  }, [uid, enabled, options.displayName]);

  const setOnlineStatus = useCallback(
    async (nextValue: boolean) => {
      if (!uid || togglingRef.current) return;

      // eslint-disable-next-line no-console
      console.log('[TOGGLE PRESSED]', {
        nextValue,
        uid: auth.currentUser?.uid ?? null,
      });

      togglingRef.current = true;
      pendingOnlineRef.current = nextValue;
      setToggling(true);

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      lastResolvedRef.current = nextValue;
      setIsOnline(nextValue);

      try {
        await updateDriverOnlineStatus(uid, nextValue);
      } catch (error) {
        pendingOnlineRef.current = null;
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const reverted = !nextValue;
        lastResolvedRef.current = reverted;
        setIsOnline(reverted);
        throw error;
      } finally {
        togglingRef.current = false;
        setToggling(false);
      }
    },
    [uid],
  );

  return {
    isOnline,
    loading,
    toggling,
    rating,
    setOnlineStatus,
    toggleOnline: setOnlineStatus,
  };
}
