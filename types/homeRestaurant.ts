import {
  evaluateDeliveryEligibility,
  parseRestaurantDeliverySettings,
} from '@/lib/delivery/deliveryEligibility';
import {
  extractRestaurantCoords,
  restaurantEntityForDistance,
} from '@/lib/location/restaurantMarketplaceCoords';
import {
  formatCad,
  pickRatingAverage,
  pickReviewCount,
  pickFirestoreServiceFee,
  resolvePromoTags,
} from '@/lib/restaurantStoreMetrics';
import {
  promotionBadgeLabel,
  promotionBadgesFromData,
  promotionDestinationsFromData,
  restaurantPromoWaivesDeliveryFee,
  restaurantPromoWaivesServiceFee,
  type PromotionBadgeValue,
  type PromotionDestinations,
  type PromotionDestinationKey,
} from '@/lib/promotionBadge';

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
  /** Service fee label when restaurant has a configured serviceFee. */
  serviceFeeLabel: string | null;
  promoLabel: string | null;
  /** Destination-aware admin + approved promo labels for home cards. */
  promoLabels: string[];
  promotionBadges: Exclude<PromotionBadgeValue, 'none'>[];
  promotionDestinations: PromotionDestinations;
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

/** Admin campaign badge labels visible on a destination surface. */
export function campaignLabelsForDestination(
  restaurant: Pick<HomeRestaurant, 'promotionBadges' | 'promotionDestinations'>,
  destination: PromotionDestinationKey | ReadonlyArray<PromotionDestinationKey>,
): string[] {
  const destinations: PromotionDestinationKey[] = Array.isArray(destination)
    ? [...destination]
    : [destination];
  const labels: string[] = [];
  for (const dest of destinations) {
    if (!restaurant.promotionDestinations[dest]) continue;
    for (const badge of restaurant.promotionBadges) {
      const label = promotionBadgeLabel(badge);
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

export function mapFirestoreRestaurant(
  id: string,
  data: Record<string, unknown>,
  userCoords?: { lat: number; lng: number } | null,
  options?: { destination?: PromotionDestinationKey },
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

  const waiveDelivery = restaurantPromoWaivesDeliveryFee(data);
  const waiveService = restaurantPromoWaivesServiceFee(data);
  const deliveryFeeAmount = waiveDelivery
    ? 0
    : eligibility.deliveryFee.amount;
  const deliveryFeeLabel = waiveDelivery
    ? 'Free Delivery'
    : eligibility.deliveryFee.label;

  const destination = options?.destination ?? 'home';
  const promoTags = resolvePromoTags({
    data,
    menuPromotions: [],
    reviewCount,
    deliveryFeeAmount,
    isPopularNearby,
    destination,
  });

  const serviceFeeAmt = waiveService ? 0 : pickFirestoreServiceFee(data);
  const serviceFeeLabel = waiveService
    ? 'Service FREE'
    : serviceFeeAmt != null
      ? `Service ${formatCad(serviceFeeAmt)}`
      : null;

  return {
    id,
    name,
    image,
    coverImage,
    rating,
    reviewCount,
    etaLabel: eligibility.etaLabel,
    deliveryFeeLabel,
    serviceFeeLabel,
    promoLabel: promoTags[0] ?? null,
    promoLabels: promoTags,
    promotionBadges: promotionBadgesFromData(data),
    promotionDestinations: promotionDestinationsFromData(data),
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : null,
    isOpen: data.isOpen !== false,
    distanceKmLabel: eligibility.distanceLabel,
    deliverable: eligibility.deliverable,
    deliveryStatusLabel: eligibility.statusLabel,
    normalizedCoords,
  };
}
