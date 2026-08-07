/**
 * EmoOrder — isolated domain types for the Emo AI Concierge experience.
 * No dependency on Food Share, Pick Up, or any existing order lifecycle.
 */

// ── Conversation phase ─────────────────────────────────────────────────────

export type EmoOrderPhase =
  | 'greeting'
  | 'searching_restaurants'
  | 'restaurant_selection'
  | 'collecting_meal'
  | 'confirming_address'
  | 'showing_summary'
  | 'paying'
  | 'payment_failed'
  | 'tracking'
  | 'delivered'
  | 'cancelled';

// ── Domain entities ────────────────────────────────────────────────────────

export type EmoOrderReview = {
  author: string;
  rating: number;
  text: string;
  timeAgo: string;
};

export type EmoOrderRestaurantOption = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  distanceLabel: string | null;
  distanceMeters: number | null;
  placeId: string | null;
  googleMapsUrl: string;
  placeType: string | null;
  /** Cuisine / category label e.g. "Italian", "Burger", "Sushi" */
  cuisineType: string | null;
  /** Price level: 1=$  2=$$  3=$$$  4=$$$$ */
  priceLevel: number | null;
  /** Hero image URL from Google Places Photos API */
  photoUrl: string | null;
  /** Whether the restaurant is currently open (from Places opening_hours.open_now) */
  isOpen: boolean | null;
  /** Estimated delivery time range in minutes (derived from distance) */
  deliveryTimeMin: number | null;
  deliveryTimeMax: number | null;
  /** Up to 3 Google review snippets */
  reviews: EmoOrderReview[];
};

export type EmoOrderMealSuggestion = {
  name: string;
  estimatedPrice: number;
  emoji: string;
};

export type EmoOrderMealDraft = {
  mealName: string;
  estimatedPrice: number;
  quantity: number;
  notes: string;
};

export type EmoOrderAddressDraft = {
  address: string;
  lat: number;
  lng: number;
};

export type EmoOrderPricing = {
  foodSubtotal: number;
  deliveryFee: number;
  serviceFee: number;
  hst: number;
  taxRate: number;
  totalPaid: number;
};

// ── Tracking ───────────────────────────────────────────────────────────────

export type EmoOrderTrackingStatus = {
  status: string;
  deliveryStatus: string | null;
  paymentStatus: string | null;
  driverName: string | null;
  driverPhone: string | null;
  etaMinutes: number | null;
  driverLocation: { lat: number; lng: number } | null;
  restaurantLocation: { lat: number; lng: number } | null;
  deliveryLocation: { lat: number; lng: number } | null;
};

// ── Chat messages ──────────────────────────────────────────────────────────

export type EmoOrderRichType =
  | 'restaurants'
  | 'meal_suggestions'
  | 'meal_form'
  | 'address_confirm'
  | 'summary'
  | 'tracking'
  | 'reviews';

export type EmoOrderChatMessage = {
  id: string;
  role: 'ai' | 'user';
  /** Plain text content (null when richType handles display) */
  text: string | null;
  richType?: EmoOrderRichType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  richData?: any;
  createdAtMs: number;
};

// ── Rich data shapes per richType ──────────────────────────────────────────

export type EmoRestaurantsRichData = {
  restaurants: EmoOrderRestaurantOption[];
};

export type EmoMealSuggestionsRichData = {
  restaurantName: string;
  suggestions: EmoOrderMealSuggestion[];
};

export type EmoAddressConfirmRichData = {
  /** null when no saved address — EmoOrderAddressInput is rendered instead of EmoOrderAddressCard */
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type EmoSummaryRichData = {
  restaurant: EmoOrderRestaurantOption;
  meal: EmoOrderMealDraft;
  address: EmoOrderAddressDraft;
  pricing: EmoOrderPricing;
};

export type EmoTrackingRichData = {
  orderId: string;
};

export type EmoReviewsRichData = {
  restaurantName: string;
  rating: number;
  reviewCount: number;
  reviews: EmoOrderReview[];
  /** Keyword themes extracted from review text */
  keywordThemes: string[];
};
