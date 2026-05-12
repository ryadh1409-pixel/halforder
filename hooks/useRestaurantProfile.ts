import { db } from '@/services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export type RestaurantProfile = {
  id: string;
  name: string;
  /** Logo / small avatar */
  image: string | null;
  /** Wide hero / cover */
  coverImage: string | null;
  address: string | null;
  rating: number;
  reviewCount: number;
};

function parseProfile(id: string, data: Record<string, unknown> | undefined): RestaurantProfile {
  if (!data) {
    return {
      id,
      name: 'Restaurant',
      image: null,
      coverImage: null,
      address: null,
      rating: 4.8,
      reviewCount: 1240,
    };
  }
  const loc = data.location && typeof data.location === 'object' ? (data.location as Record<string, unknown>) : null;
  const addr =
    typeof data.address === 'string'
      ? data.address
      : loc && typeof loc.address === 'string'
        ? loc.address
        : null;
  const img =
    typeof data.image === 'string'
      ? data.image
      : typeof data.logoUrl === 'string'
        ? data.logoUrl
        : typeof data.photoUrl === 'string'
          ? data.photoUrl
          : null;
  const cover =
    typeof data.coverImage === 'string'
      ? data.coverImage
      : typeof data.bannerUrl === 'string'
        ? data.bannerUrl
        : img;
  return {
    id,
    name:
      (typeof data.name === 'string' && data.name) ||
      (typeof data.restaurantName === 'string' && data.restaurantName) ||
      'Restaurant',
    image: img,
    coverImage: cover,
    address: addr,
    rating: typeof data.rating === 'number' && Number.isFinite(data.rating) ? data.rating : 4.8,
    reviewCount:
      typeof data.reviewsCount === 'number'
        ? data.reviewsCount
        : typeof data.reviewCount === 'number'
          ? data.reviewCount
          : 1240,
  };
}

export function useRestaurantProfile(restaurantId: string | null) {
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setProfile(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const ref = doc(db, 'restaurants', restaurantId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(parseProfile(restaurantId, snap.exists() ? (snap.data() as Record<string, unknown>) : undefined));
        setLoading(false);
      },
      () => {
        setProfile(parseProfile(restaurantId, undefined));
        setLoading(false);
      },
    );
    return () => unsub();
  }, [restaurantId]);

  return useMemo(() => ({ profile, loading }), [profile, loading]);
}
