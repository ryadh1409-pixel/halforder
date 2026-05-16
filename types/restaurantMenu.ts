/**
 * Firestore-oriented types for restaurant menu & discovery.
 * Collections (typical layout):
 * - `restaurants/{restaurantId}` — profile, hours, fees, geo
 * - `restaurants/{restaurantId}/menuItems/{itemId}` — dishes (see `FoodItem` in foodService)
 *
 * Optional future: `restaurants/{restaurantId}/categories/{id}` for explicit sort order / visibility.
 */

import type { FoodItem } from '@/services/foodService';

/** Minimal restaurant document fields the premium screen cares about (see useRestaurantProfile). */
export type RestaurantMenuFirestoreDoc = {
  name?: string;
  restaurantName?: string;
  image?: string;
  logoUrl?: string;
  photoUrl?: string;
  coverImage?: string;
  bannerUrl?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
  reviewCount?: number;
  /** Estimated delivery fee in major currency units (optional; UI can fallback). */
  deliveryFee?: number;
  /** Service / small order fee */
  serviceFee?: number;
};

/** Extended tags for UX sections (persist on menuItems in Firestore). */
export type MenuItemUxTags = {
  /** Force into “Popular” horizontal rail */
  popular?: boolean;
  /** “Recommended” rail */
  recommended?: boolean;
  /** Promo label overrides enrichment (e.g. "Buy 1, get 1") */
  promotion?: string | null;
};

export type RestaurantMenuItem = FoodItem & MenuItemUxTags;

/** Grouped rails for Uber Eats–style horizontal scrollers */
export type MenuSectionRails = {
  popular: FoodItem[];
  deals: FoodItem[];
  recommended: FoodItem[];
  drinks: FoodItem[];
  desserts: FoodItem[];
};
