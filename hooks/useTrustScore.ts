import {
  getTrustScoreProfile,
  type TrustScoreProfile,
} from '@/services/ratings';
import { useEffect, useState } from 'react';

export function useTrustScore(userId: string | null): TrustScoreProfile | null {
  const [score, setScore] = useState<TrustScoreProfile | null>(null);

  useEffect(() => {
    if (!userId) {
      setScore(null);
      return;
    }
    let cancelled = false;
    getTrustScoreProfile(userId).then((s) => {
      if (!cancelled) setScore(s);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return score;
}
