import {
    COMPLETE_MEAL_FEATURE,
    COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS,
    COMPLETE_MEAL_MIN_OWNER_CENTS,
} from '@/constants/completeMeal';

export type CompleteMealCampaignStatus =
  | 'awaiting_owner_payment'
  | 'open'
  | 'funded'
  | 'ordered'
  | 'cancelled';

export type CompleteMealOrderDraftItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
};

export type CompleteMealOrderDraft = {
  restaurantId: string;
  restaurantName: string;
  items: CompleteMealOrderDraftItem[];
  totalPrice: number;
  foodSubtotal: number;
  tax: number;
  taxRate: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  promoCode: string | null;
  deliveryType: 'delivery' | 'pickup';
  deliveryLocation: { lat: number; lng: number; address: string };
  customerLocation?: {
    latitude: number;
    longitude: number;
    timestamp?: number;
  } | null;
};

export type CompleteMealContributor = {
  contributionId: string;
  uid: string;
  displayName: string;
  amountCents: number;
  paidAt: number | null;
};

export type CompleteMealCampaignPublic = {
  campaignId: string;
  shareToken: string;
  status: CompleteMealCampaignStatus;
  ownerUid: string;
  ownerFirstName: string;
  restaurantId: string;
  restaurantName: string;
  mealLabel: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  progressRatio: number;
  contributors: CompleteMealContributor[];
  orderId: string | null;
  canCancel: boolean;
  feature: typeof COMPLETE_MEAL_FEATURE;
};

export type CreateCompleteMealCampaignInput = {
  orderDraft: CompleteMealOrderDraft;
  ownerPayCents: number;
  ownerFirstName?: string;
};

export function moneyLabelFromCents(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export function clampOwnerPayCents(
  ownerPayCents: number,
  totalCents: number,
): { ok: true; ownerPayCents: number } | { ok: false; message: string } {
  const total = Math.round(totalCents);
  const pay = Math.round(ownerPayCents);
  if (total < COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS) {
    return { ok: false, message: 'Order total is too low for Complete My Meal.' };
  }
  const minOwner = Math.min(
    total,
    Math.max(COMPLETE_MEAL_MIN_OWNER_CENTS, COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS),
  );
  if (pay < minOwner) {
    return {
      ok: false,
      message: `Pay at least $${(minOwner / 100).toFixed(2)} to start Complete My Meal.`,
    };
  }
  if (pay > total) {
    return { ok: false, message: 'Pay now cannot exceed the order total.' };
  }
  if (pay < total && total - pay < COMPLETE_MEAL_MIN_CONTRIBUTION_CENTS) {
    return {
      ok: false,
      message: 'Leave at least $0.50 remaining for friends, or pay the full amount.',
    };
  }
  return { ok: true, ownerPayCents: pay };
}
