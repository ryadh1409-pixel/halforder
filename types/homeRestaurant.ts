/** Normalized restaurant card for Uber Eats–style home feed (Firestore `restaurants`). */
export type HomeRestaurant = {
  id: string;
  name: string;
  image: string | null;
  coverImage: string | null;
  rating: number;
  reviewCount: number;
  etaMin: number;
  etaMax: number;
  deliveryFee: number;
  promoLabel: string | null;
  cuisine: string | null;
  isOpen: boolean;
  distanceMi: number;
};

export function mapFirestoreRestaurant(
  id: string,
  data: Record<string, unknown>,
): HomeRestaurant {
  const name =
    typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Restaurant';
  const image =
    (typeof data.image === 'string' && data.image) ||
    (typeof data.logo === 'string' && data.logo) ||
    null;
  const coverImage =
    (typeof data.coverImage === 'string' && data.coverImage) ||
    (typeof data.cover === 'string' && data.cover) ||
    image;
  const rating = typeof data.rating === 'number' ? data.rating : 4.7;
  const reviewCount =
    typeof data.reviewCount === 'number'
      ? data.reviewCount
      : typeof data.reviews === 'number'
        ? data.reviews
        : 200;
  return {
    id,
    name,
    image,
    coverImage,
    rating,
    reviewCount,
    etaMin: 20,
    etaMax: 35,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 2.49,
    promoLabel:
      typeof data.promoLabel === 'string'
        ? data.promoLabel
        : data.hasOffer === true
          ? 'Offer'
          : null,
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : null,
    isOpen: data.isOpen !== false,
    distanceMi: typeof data.distanceMi === 'number' ? data.distanceMi : 2.1,
  };
}
