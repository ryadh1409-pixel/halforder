import {
  loadRepeatOrderRecommendation,
  rebuildCartFromRepeatOrder,
} from '@/services/repeatOrderService';
import { onRepeatOrderPlacedCancelNotifications } from '@/services/repeatOrderNotifications';
import { auth } from '@/services/firebase';
import type { RepeatOrderRecommendation } from '@/types/repeatOrder';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

type State = {
  recommendation: RepeatOrderRecommendation | null;
  loading: boolean;
  ordering: boolean;
  error: string | null;
  refresh: () => void;
  /** Returns checkout path on success, or null. Sets `error` on failure. */
  orderAgain: () => Promise<{ path: string | null; error: string | null }>;
};

/**
 * Home-only Repeat Order recommendation + habit notification sync.
 * Loads on focus; uses local cache to avoid extra Firestore reads.
 */
export function useRepeatOrderRecommendation(
  uid: string | null | undefined,
): State {
  const isFocused = useIsFocused();
  const [recommendation, setRecommendation] =
    useState<RepeatOrderRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const lastUid = useRef<string | null>(null);
  const forceNext = useRef(false);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const id = typeof uid === 'string' ? uid.trim() : '';
    if (!id || !isFocused) {
      if (!id) {
        setRecommendation(null);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    const forceRefresh = forceNext.current || lastUid.current !== id;
    forceNext.current = false;
    lastUid.current = id;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await loadRepeatOrderRecommendation({
          uid: id,
          forceRefresh,
        });
        if (!cancelled) setRecommendation(result);
      } catch {
        if (!cancelled) {
          setRecommendation(null);
          setError(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, isFocused, tick]);

  const orderAgain = useCallback(async (): Promise<{
    path: string | null;
    error: string | null;
  }> => {
    if (!recommendation || ordering) {
      return { path: null, error: null };
    }
    const uidNow = lastUid.current ?? auth.currentUser?.uid ?? '';
    if (!uidNow) return { path: null, error: 'Sign in to reorder.' };
    setOrdering(true);
    setError(null);
    try {
      const fresh = await loadRepeatOrderRecommendation({
        uid: uidNow,
        forceRefresh: true,
      });
      if (!fresh) {
        setRecommendation(null);
        const msg = 'This usual order is no longer available.';
        setError(msg);
        return { path: null, error: msg };
      }
      setRecommendation(fresh);
      const rebuilt = rebuildCartFromRepeatOrder(fresh);
      if (!rebuilt.ok) {
        setError(rebuilt.error);
        return { path: null, error: rebuilt.error };
      }
      void onRepeatOrderPlacedCancelNotifications({
        uid: uidNow,
        restaurantId: fresh.restaurantId,
        habitKey: fresh.habitKey,
      });
      return { path: rebuilt.checkoutPath, error: null };
    } catch {
      const msg = 'Could not rebuild your order. Please try again.';
      setError(msg);
      return { path: null, error: msg };
    } finally {
      setOrdering(false);
    }
  }, [ordering, recommendation]);

  return {
    recommendation,
    loading,
    ordering,
    error,
    refresh,
    orderAgain,
  };
}
