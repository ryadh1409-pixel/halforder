import type { SwipeFilterKey } from '@/constants/swipeDiscovery';

export type SwipeDirection = 'like' | 'pass';

export type SwipeFoodCard = {
  id: string;
  title: string;
  restaurantName: string;
  restaurantId: string;
  type: 'pizza' | 'noodles' | 'burger' | 'salad' | 'dessert' | 'other';
  price: number;
  splitPriceLabel: string;
  time: string;
  distance: string;
  peopleJoined: number;
  spotsLeft: number;
  categories: SwipeFilterKey[];
  createdBy: string;
  userName: string;
  userAvatar: string | null;
  isOwner: boolean;
  distanceLabel: string;
  /** Recent joiner display names for social proof */
  recentJoiners: string[];
  heroImageUri: string;
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
  orderId: string;
  foodTitle: string;
  splitPrice: number;
  sharedOrderId: string | null;
  partnerUid: string;
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
