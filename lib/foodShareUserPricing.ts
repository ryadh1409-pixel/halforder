import {
  restaurantPromoWaivesDeliveryFee,
  restaurantPromoWaivesServiceFee,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import { isPickupFulfillmentMode } from '@/lib/foodShareFulfillment';
import { computeOrderPricing, DEFAULT_TAX_RATE } from '@/lib/orderPricing';

export const DEFAULT_FOOD_SHARE_SERVICE_FEE = 2;

export type FoodShareSavingsFields = {
  originalDeliveryFee: number;
  sharedDeliveryFee: number;
  originalServiceFee: number;
  sharedServiceFee: number;
  deliverySaving: number;
  serviceFeeSaving: number;
  promotionSaving: number;
  foodSaving: number;
  totalSaving: number;
};

export type FoodShareUserPricing = FoodShareSavingsFields & {
  originalFoodPrice: number;
  sharedFoodPrice: number;
  freeDelivery: boolean;
  freeServiceFee: boolean;
  promoDiscount: number;
  taxRate: number;
  tax: number;
  subtotalBeforeTax: number;
  grandTotal: number;
  /** Food + shared delivery + shared service (pre-tax, pre-promo display). */
  displaySubtotal: number;
  sharedDeliverySaving: number;
  freeDeliverySaving: number;
  sharedServiceFeeSaving: number;
  freeServiceFeeSaving: number;
};

export type BuildFoodShareUserPricingInput = {
  originalFoodPrice: number;
  sharedFoodPrice: number;
  /** Per-user delivery share configured on the admin card. */
  userDeliveryShare: number;
  /** Full service fee before split (restaurant/platform). */
  originalServiceFee?: number | null;
  promoDiscount?: number | null;
  taxRate?: number | null;
  promotionBadges?: ReadonlyArray<PromotionBadgeValue | string>;
  shareRaw?: Record<string, unknown> | null;
  /** When pickup, delivery fee is always $0 (Delivery pricing unchanged). */
  fulfillmentMode?: 'delivery' | 'pickup';
  /**
   * Target Price promotion: the final amount the participant pays (e.g. CA$1).
   * When set, promoDiscount is computed as  max(0, subtotal − promoTargetPrice)
   * so the total equals the target price exactly.
   * Takes precedence over promoDiscount when both are provided.
   */
  promoTargetPrice?: number | null;
};

function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function splitHalf(full: number): number {
  return roundMoney(full / 2);
}

export function resolveFoodShareServiceFee(
  input: Pick<BuildFoodShareUserPricingInput, 'originalServiceFee' | 'shareRaw'>,
): number {
  if (
    typeof input.originalServiceFee === 'number' &&
    Number.isFinite(input.originalServiceFee)
  ) {
    return roundMoney(input.originalServiceFee);
  }
  const raw = input.shareRaw ?? {};
  if (typeof raw.serviceFee === 'number' && Number.isFinite(raw.serviceFee)) {
    return roundMoney(raw.serviceFee);
  }
  return DEFAULT_FOOD_SHARE_SERVICE_FEE;
}

/**
 * Builds per-user food share pricing with split delivery/service fees and savings.
 * `userDeliveryShare` is the amount each user pays toward delivery (half of full fee).
 */
export function buildFoodShareUserPricing(
  input: BuildFoodShareUserPricingInput,
): FoodShareUserPricing {
  const originalFoodPrice = roundMoney(input.originalFoodPrice);
  const sharedFoodPrice = roundMoney(input.sharedFoodPrice);
  const isPickup =
    input.fulfillmentMode === 'pickup' ||
    isPickupFulfillmentMode(input.shareRaw ?? null);
  const userDeliveryShare = isPickup
    ? 0
    : roundMoney(input.userDeliveryShare);
  const originalDeliveryFee = roundMoney(userDeliveryShare * 2);
  const originalServiceFee = resolveFoodShareServiceFee(input);
  const promoSource = input.shareRaw ?? {
    promotionBadges: input.promotionBadges,
    promotionBadge: input.promotionBadges?.[0],
  };
  const freeDelivery = isPickup
    ? true
    : restaurantPromoWaivesDeliveryFee(promoSource);
  const freeServiceFee = restaurantPromoWaivesServiceFee(promoSource);
  const taxRate =
    typeof input.taxRate === 'number' && Number.isFinite(input.taxRate)
      ? input.taxRate
      : DEFAULT_TAX_RATE;

  const sharedDeliveryFee = freeDelivery ? 0 : userDeliveryShare;
  const sharedServiceFee = freeServiceFee ? 0 : splitHalf(originalServiceFee);

  // Target Price: discount = subtotal − targetPrice  (total === targetPrice).
  // Fixed discount: discount = promoDiscount (backward-compatible).
  const subtotalForPromo = sharedFoodPrice + sharedDeliveryFee + sharedServiceFee;
  const promoDiscount =
    input.promoTargetPrice != null && input.promoTargetPrice >= 0
      ? roundMoney(Math.max(0, subtotalForPromo - input.promoTargetPrice))
      : roundMoney(input.promoDiscount ?? 0);

  const foodSaving = roundMoney(Math.max(0, originalFoodPrice - sharedFoodPrice));
  const sharedDeliverySaving = freeDelivery
    ? 0
    : roundMoney(Math.max(0, originalDeliveryFee - sharedDeliveryFee));
  const freeDeliverySaving = freeDelivery ? originalDeliveryFee : 0;
  const sharedServiceFeeSaving = freeServiceFee
    ? 0
    : roundMoney(Math.max(0, originalServiceFee - sharedServiceFee));
  const freeServiceFeeSaving = freeServiceFee ? originalServiceFee : 0;
  const deliverySaving = roundMoney(sharedDeliverySaving + freeDeliverySaving);
  const serviceFeeSaving = roundMoney(sharedServiceFeeSaving + freeServiceFeeSaving);
  const promotionSaving = promoDiscount;
  const totalSaving = roundMoney(
    foodSaving +
      deliverySaving +
      serviceFeeSaving +
      promotionSaving,
  );

  const priced = computeOrderPricing({
    foodSubtotal: sharedFoodPrice,
    deliveryFee: sharedDeliveryFee,
    serviceFee: sharedServiceFee,
    promoDiscount,
    taxRate,
  });

  return {
    originalFoodPrice,
    sharedFoodPrice,
    originalDeliveryFee,
    sharedDeliveryFee,
    originalServiceFee,
    sharedServiceFee,
    freeDelivery,
    freeServiceFee,
    promoDiscount,
    taxRate,
    tax: priced.hst,
    subtotalBeforeTax: roundMoney(
      sharedFoodPrice + sharedDeliveryFee + sharedServiceFee - promoDiscount,
    ),
    grandTotal: priced.totalPaid,
    displaySubtotal: roundMoney(
      sharedFoodPrice + sharedDeliveryFee + sharedServiceFee,
    ),
    foodSaving,
    deliverySaving,
    serviceFeeSaving,
    promotionSaving,
    totalSaving,
    sharedDeliverySaving,
    freeDeliverySaving,
    sharedServiceFeeSaving,
    freeServiceFeeSaving,
  };
}

export function foodShareSavingsFields(
  pricing: FoodShareUserPricing,
): FoodShareSavingsFields {
  return {
    originalDeliveryFee: pricing.originalDeliveryFee,
    sharedDeliveryFee: pricing.sharedDeliveryFee,
    originalServiceFee: pricing.originalServiceFee,
    sharedServiceFee: pricing.sharedServiceFee,
    deliverySaving: pricing.deliverySaving,
    serviceFeeSaving: pricing.serviceFeeSaving,
    promotionSaving: pricing.promotionSaving,
    foodSaving: pricing.foodSaving,
    totalSaving: pricing.totalSaving,
  };
}

export function pricingFromShareDoc(
  share: {
    originalPrice: number;
    sharedPrice: number;
    deliveryShare: number;
    promotionBadges?: ReadonlyArray<PromotionBadgeValue | string>;
    promotionBadge?: PromotionBadgeValue;
    fulfillmentMode?: 'delivery' | 'pickup';
  },
  shareRaw?: Record<string, unknown> | null,
  extras?: {
    originalServiceFee?: number | null;
    promoDiscount?: number | null;
    /** Target Price promotion — takes precedence over promoDiscount. */
    promoTargetPrice?: number | null;
    taxRate?: number | null;
  },
): FoodShareUserPricing {
  return buildFoodShareUserPricing({
    originalFoodPrice: share.originalPrice,
    sharedFoodPrice: share.sharedPrice,
    userDeliveryShare: share.deliveryShare,
    promotionBadges: share.promotionBadges,
    fulfillmentMode: share.fulfillmentMode,
    shareRaw: shareRaw ?? {
      promotionBadges: share.promotionBadges,
      promotionBadge: share.promotionBadge,
      serviceFee: extras?.originalServiceFee,
      fulfillmentMode: share.fulfillmentMode,
    },
    originalServiceFee: extras?.originalServiceFee,
    promoDiscount: extras?.promoDiscount,
    promoTargetPrice: extras?.promoTargetPrice,
    taxRate: extras?.taxRate,
  });
}
