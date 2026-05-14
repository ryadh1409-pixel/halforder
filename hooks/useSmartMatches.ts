import { detectTimeContext } from '@/services/chatAssistantOrders';
import { useAuth } from '@/services/AuthContext';
import {
  getSmartMatches,
  type SmartMatchOrder,
  type SmartMatchesErrorCode,
} from '@/services/matchingEngine';
import { useCallback, useEffect, useState } from 'react';

export type SmartMatchesState = {
  loading: boolean;
  data: { aiText: string; nearbyOrders: SmartMatchOrder[] } | null;
  error: SmartMatchesErrorCode | null;
};

type UseSmartMatchesOptions = {
  /** When false (e.g. tab not focused), skips Firestore and clears loading. Default true. */
  enabled?: boolean;
};

/**
 * Loads geo-ranked joinable orders for the AI tab (`getSmartMatches`).
 * Food intent comes from `detectTimeContext()` so deps stay stable across re-renders.
 */
export function useSmartMatches(
  location: { lat: number; lng: number } | null | undefined,
  options?: UseSmartMatchesOptions,
): SmartMatchesState & { retry: () => void } {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SmartMatchesState['data']>(null);
  const [error, setError] = useState<SmartMatchesErrorCode | null>(null);

  const run = useCallback(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!user?.uid || !location) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const food = detectTimeContext().fallbackFood;
    setLoading(true);
    setError(null);
    void getSmartMatches({
      lat: location.lat,
      lng: location.lng,
      food,
      uid: user.uid,
    })
      .then((res) => {
        setData({ aiText: res.aiText, nearbyOrders: res.nearbyOrders });
        setError(res.error ?? null);
      })
      .catch(() => {
        setData(null);
        setError('unknown');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [enabled, user?.uid, location?.lat, location?.lng]);

  useEffect(() => {
    run();
  }, [run]);

  return { loading, data, error, retry: run };
}
