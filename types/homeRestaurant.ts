import {
  calculateDeliveryFee,
  calculateETA,
  distanceKmBetween,
  extractRestaurantCoords,
  formatDistanceKm,
  pickFirestoreDeliveryFee,
  pickRatingAverage,
  pickReviewCount,
  resolvePromoTags,
} from '@/lib/restaurantStoreMetrics';

/** Normalized restaurant card for Uber Eats–style home feed (Firestore `restaurants`). */
export type HomeRestaurant = {
  id: string;
  name: string;
  image: string | null;
  coverImage: string | null;
  rating: number | null;
  reviewCount: number;
  etaLabel: string;
  deliveryFeeLabel: string;
  promoLabel: string | null;
  cuisine: string | null;
  isOpen: boolean;
  /** Pre-formatted e.g. `2.4 km`; null when user location unavailable */
  distanceKmLabel: string | null;
};

export function mapFirestoreRestaurant(
  id: string,
  data: Record<string, unknown>,
  userCoords?: { lat: number; lng: number } | null,
): HomeRestaurant {
  const name =
    typeof data.name === 'string' && data.name.trim()
      ? data.name.trim()
      : 'Restaurant';
  const image =
    (typeof data.image === 'string' && data.image) ||
    (typeof data.logo === 'string' && data.logo) ||
    null;
  const coverImage =
    (typeof data.coverImage === 'string' && data.coverImage) ||
    (typeof data.cover === 'string' && data.cover) ||
    image;

  const reviewCount = pickReviewCount(data);
  const rating = pickRatingAverage(data, reviewCount);

  const restaurantCoords = extractRestaurantCoords(data);
  const distanceKm = distanceKmBetween(userCoords ?? null, restaurantCoords);
  const distanceKmLabel = formatDistanceKm(distanceKm);

  const firestoreFee = pickFirestoreDeliveryFee(data);
  const deliveryFee = calculateDeliveryFee({
    mode: 'delivery',
    distanceKm,
    firestoreFee,
  });

  const etaLabel = calculateETA({ mode: 'delivery', distanceKm });

  const isPopularNearby =
    data.popular === true &&
    distanceKm != null &&
    distanceKm <= 3;

  const promoTags = resolvePromoTags({
    data,
    menuPromotions: [],
    reviewCount,
    deliveryFeeAmount: deliveryFee.amount,
    isPopularNearby,
  });

  return {
    id,
    name,
    image,
    coverImage,
    rating,
    reviewCount,
    etaLabel,
    deliveryFeeLabel: deliveryFee.label,
    promoLabel: promoTags[0] ?? null,
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : null,
    isOpen: data.isOpen !== false,
    distanceKmLabel,
  };
}
