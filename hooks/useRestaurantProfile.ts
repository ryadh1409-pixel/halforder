import { db } from '@/services/firebase';
import { parseRestaurantDeliveryLocation } from '@/lib/location/restaurantDeliveryLocation';
import {
  extractRestaurantCoords,
  pickFirestoreDeliveryFee,
  pickFirestoreServiceFee,
  pickRatingAverage,
  pickReviewCount,
} from '@/lib/restaurantStoreMetrics';
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
  rating: number | null;
  reviewCount: number;
  coords: { lat: number; lng: number } | null;
  deliveryFee: number | null;
  serviceFee: number | null;
  /** Raw Firestore fields for status / promo helpers */
  raw: Record<string, unknown>;
};

function parseProfile(
  id: string,
  data: Record<string, unknown> | undefined,
): RestaurantProfile {
  if (!data) {
    return {
      id,
      name: 'Restaurant',
      image: null,
      coverImage: null,
      address: null,
      rating: null,
      reviewCount: 0,
      coords: null,
      deliveryFee: null,
      serviceFee: null,
      raw: {},
    };
  }

  const venue = parseRestaurantDeliveryLocation(data);
  const addr =
    venue?.address ??
    (typeof data.address === 'string' ? data.address : null) ??
    (typeof data.formattedAddress === 'string' ? data.formattedAddress : null);
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

  const reviewCount = pickReviewCount(data);
  const rating = pickRatingAverage(data, reviewCount);

  return {
    id,
    name:
      (typeof data.name === 'string' && data.name) ||
      (typeof data.restaurantName === 'string' && data.restaurantName) ||
      'Restaurant',
    image: img,
    coverImage: cover,
    address: addr,
    rating,
    reviewCount,
    coords: extractRestaurantCoords(data),
    deliveryFee: pickFirestoreDeliveryFee(data),
    serviceFee: pickFirestoreServiceFee(data),
    raw: data,
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
        setProfile(
          parseProfile(
            restaurantId,
            snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
          ),
        );
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
