import {
  evaluateDeliveryEligibility,
  parseRestaurantDeliverySettings,
} from '@/lib/delivery/deliveryEligibility';
import {
  extractRestaurantCoords,
  restaurantEntityForDistance,
} from '@/lib/location/restaurantMarketplaceCoords';
import {
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
  /** False when customer is outside this restaurant's delivery zone. */
  deliverable: boolean;
  /** e.g. "Delivery unavailable" for card badges. */
  deliveryStatusLabel: string;
  /** Canonical WGS84 pair — marketplace distance uses this only. */
  normalizedCoords: { lat: number; lng: number } | null;
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

  const normalizedCoords = extractRestaurantCoords(data);
  const settings = parseRestaurantDeliverySettings(data);
  const eligibility = evaluateDeliveryEligibility({
    customer: userCoords ?? null,
    restaurant: restaurantEntityForDistance(normalizedCoords),
    settings,
    mode: 'delivery',
  });

  const isPopularNearby =
    data.popular === true &&
    eligibility.distanceKm != null &&
    eligibility.distanceKm <= 3;

  const promoTags = resolvePromoTags({
    data,
    menuPromotions: [],
    reviewCount,
    deliveryFeeAmount: eligibility.deliveryFee.amount,
    isPopularNearby,
  });

  return {
    id,
    name,
    image,
    coverImage,
    rating,
    reviewCount,
    etaLabel: eligibility.etaLabel,
    deliveryFeeLabel: eligibility.deliveryFee.label,
    promoLabel: promoTags[0] ?? null,
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : null,
    isOpen: data.isOpen !== false,
    distanceKmLabel: eligibility.distanceLabel,
    deliverable: eligibility.deliverable,
    deliveryStatusLabel: eligibility.statusLabel,
    normalizedCoords,
  };
}
