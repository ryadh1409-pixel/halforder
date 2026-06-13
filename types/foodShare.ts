/** Admin-controlled swipe catalog card (`adminFoodShares/{1..10}`). */
export type AdminFoodShareDoc = {
  id: string;
  foodName: string;
  restaurantName: string;
  image: string;
  originalPrice: number;
  sharedPrice: number;
  deliveryShare: number;
  description: string;
  active: boolean;
  createdAtMs: number | null;
};

export type FoodSharePaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'REFUNDED'
  | 'FAILED';

export type FoodShareMatchLifecycle =
  | 'CREATED'
  | 'WAITING_FOR_PARTNER'
  | 'WAITING_FOR_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'MATCHED'
  | 'ORDER_PLACED'
  | 'DRIVER_ASSIGNED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type FoodShareUserPaymentState = {
  paymentStatus: FoodSharePaymentStatus;
  stripePaymentIntentId?: string;
  amount?: number;
};

export type MatchRequestStatus = 'WAITING' | 'MATCHED' | 'CANCELLED';

export type MatchRequestDoc = {
  id: string;
  adminFoodShareId: string;
  userId: string;
  userFirstName: string;
  status: MatchRequestStatus;
  matchId: string | null;
  createdAtMs: number | null;
};

export type FoodShareCostBreakdown = {
  originalPrice: number;
  sharedPrice: number;
  deliveryShare: number;
  totalPerUser: number;
};

export type FoodShareMatchDoc = {
  id: string;
  adminFoodShareId: string;
  users: [string, string];
  userA: { uid: string; firstName: string; photoUrl: string | null };
  userB: { uid: string; firstName: string; photoUrl: string | null };
  foodName: string;
  restaurantName: string;
  foodImageUrl: string;
  status: 'pending_payment' | 'MATCHED' | 'CANCELLED';
  lifecycle: FoodShareMatchLifecycle;
  orderStatus: string | null;
  deliveryStatus: string | null;
  costBreakdown: FoodShareCostBreakdown;
  userPayments: Record<string, FoodShareUserPaymentState>;
  matchChatId: string;
  createdAtMs: number | null;
};

export type MatchChatMessage = {
  id: string;
  senderId: string;
  senderFirstName: string;
  text: string;
  createdAtMs: number | null;
};
