import {
  loadAbandonedCheckoutHomeCard,
  prepareAbandonedCheckoutComplete,
} from '@/services/abandonedCheckoutService';
import type { AbandonedCheckoutHomeCard } from '@/types/abandonedCheckoutRecovery';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

type State = {
  card: AbandonedCheckoutHomeCard | null;
  loading: boolean;
  completing: boolean;
  error: string | null;
  refresh: () => void;
  completeOrder: () => Promise<{ path: string | null; error: string | null }>;
};

/**
 * Home Abandoned Checkout Recovery — loads unpaid checkout card on focus.
 */
export function useAbandonedCheckoutRecovery(
  uid: string | null | undefined,
): State {
  const isFocused = useIsFocused();
  const [card, setCard] = useState<AbandonedCheckoutHomeCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
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
        setCard(null);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    forceNext.current = false;
    lastUid.current = id;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await loadAbandonedCheckoutHomeCard(id);
        if (!cancelled) setCard(result);
      } catch {
        if (!cancelled) {
          setCard(null);
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

  // Countdown tick for offer timer
  useEffect(() => {
    if (!card?.offerSecondsRemaining || card.offerSecondsRemaining <= 0) {
      return;
    }
    const t = setInterval(() => {
      setCard((prev) => {
        if (!prev?.offerSecondsRemaining) return prev;
        const next = prev.offerSecondsRemaining - 1;
        if (next <= 0) {
          return { ...prev, offer: null, offerSecondsRemaining: null };
        }
        return { ...prev, offerSecondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [card?.orderId, Boolean(card?.offerSecondsRemaining)]);

  const completeOrder = useCallback(async (): Promise<{
    path: string | null;
    error: string | null;
  }> => {
    if (!card || completing) return { path: null, error: null };
    setCompleting(true);
    setError(null);
    try {
      const { path } = await prepareAbandonedCheckoutComplete(card.orderId);
      return { path, error: null };
    } catch {
      const msg = 'Could not open checkout. Please try again.';
      setError(msg);
      return { path: null, error: msg };
    } finally {
      setCompleting(false);
    }
  }, [card, completing]);

  return {
    card,
    loading,
    completing,
    error,
    refresh,
    completeOrder,
  };
}
