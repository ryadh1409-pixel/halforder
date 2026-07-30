import type { FoodShareFulfillmentMode } from '@/lib/foodShareFulfillment';
import type {
  PromotionBadgeValue,
  PromotionDestinations,
} from '@/lib/promotionBadge';
import type { FoodShareCostBreakdown } from '@/lib/foodSharePricing';

export type { FoodShareCostBreakdown };
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
  /** Missing means immediately available (backward compatible). */
  availableFromMs: number | null;
  /** Missing means no automatic expiry (backward compatible). */
  availableUntilMs: number | null;
  /** Defaults to delivery when missing. */
  fulfillmentMode: FoodShareFulfillmentMode;
  /** Admin promotion badge: primary / legacy. */
  promotionBadge: PromotionBadgeValue;
  /** Active campaign badges (may include free_delivery, etc.). */
  promotionBadges: Exclude<PromotionBadgeValue, 'none'>[];
  promotionDestinations: PromotionDestinations;
};

export type FoodSharePaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'NOT_REQUIRED'
  | 'REFUNDED'
  | 'FAILED';

export type PickupReimbursementStatus = 'HELD' | 'RELEASED' | 'NONE';

export type FoodShareMatchLifecycle =
  | 'CREATED'
  | 'WAITING_FOR_PARTNER'
  | 'WAITING_FOR_PAYMENT'
  | 'WAITING_FOR_PAYMENT_CONFIRMATION'
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
  orderId?: string | null;
  driverId?: string | null;
  assignedDriverId?: string | null;
  costBreakdown: FoodShareCostBreakdown;
  userPayments: Record<string, FoodShareUserPaymentState>;
  matchChatId: string;
  createdAtMs: number | null;
  /** Additive — missing means delivery (legacy matches). */
  fulfillmentMode?: FoodShareFulfillmentMode;
  /** Pickup host who pays the restaurant in person (User A). */
  pickupHostUid?: string | null;
  /** Pickup joiner whose in-app payment is held then released to the host. */
  pickupJoinerUid?: string | null;
  pickupReimbursementStatus?: PickupReimbursementStatus;
  pickupConfirmedAtMs?: number | null;
};

export type MatchChatMessage = {
  id: string;
  senderId: string;
  senderUid: string;
  senderFirstName: string;
  text: string;
  createdAtMs: number | null;
  sentAtMs: number | null;
  deliveredAtMs: number | null;
  readAtMs: number | null;
};
