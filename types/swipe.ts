import type { FoodShareCostBreakdown, FoodShareMatchLifecycle } from '@/types/foodShare';

export type SwipeDirection = 'like' | 'pass';

export type SwipeFoodCard = {
  id: string;
  adminFoodShareId: string;
  title: string;
  restaurantName: string;
  restaurantId: string;
  type: 'pizza' | 'noodles' | 'burger' | 'salad' | 'dessert' | 'other';
  originalPrice: number;
  sharedPrice: number;
  deliveryShare: number;
  totalPerUser: number;
  price: number;
  description: string;
  splitPriceLabel: string;
  distance: string;
  peopleJoined: number;
  spotsLeft: number;
  heroImageUri: string;
  orderStatus: string | null;
  deliveryStatus: string | null;
  lifecycle: FoodShareMatchLifecycle;
};

export type SwipeDeckLoadingCard = {
  id: 'loading';
  title: string;
  subtitle: string;
};

export type SwipeRecord = {
  userId: string;
  foodId: string;
  restaurantId: string;
  orderId: string;
  direction: SwipeDirection;
  createdAt: unknown;
};

export type FoodMatch = {
  id: string;
  orderId: string;
  users: string[];
  status: string;
};

export type SwipeMatchPreview = {
  matchId: string;
  adminFoodShareId: string;
  matchChatId: string;
  foodTitle: string;
  restaurantName: string;
  partnerUid: string;
  partnerFirstName: string;
  myFirstName: string;
  costBreakdown: FoodShareCostBreakdown;
};

export type SharedOrderCartItem = {
  id: string;
  title: string;
  quantity: number;
  pricePerPerson: number;
  total: number;
};

export type SharedOrderRoom = {
  id: string;
  orderId: string;
  matchId?: string;
  participantIds: string[];
  foodTitle: string;
  restaurantName?: string;
  heroImageUri?: string;
  splitPrice: number;
  cartSubtotal: number;
  status: 'open' | 'checkout_started' | 'paid' | 'cancelled';
  cartItems: SharedOrderCartItem[];
};

export type SharedOrderParticipant = {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isCurrentUser: boolean;
};

export type SharedOrderMessage = {
  id: string;
  text: string;
  senderName: string;
  createdAt?: unknown;
};
