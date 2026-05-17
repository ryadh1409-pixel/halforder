import type { SwipeFilterKey } from '@/constants/swipeDiscovery';

export type SwipeDirection = 'like' | 'pass';

export type SwipeFoodCard = {
  id: string;
  title: string;
  restaurantName: string;
  type: 'pizza' | 'noodles' | 'burger' | 'other';
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
