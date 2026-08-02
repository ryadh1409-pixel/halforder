import type { FoodShareUserPricing } from '@/lib/foodShareUserPricing';
import { pricingFromShareDoc } from '@/lib/foodShareUserPricing';
import type { PromotionBadgeValue } from '@/lib/promotionBadge';

export type FoodShareCostBreakdown = FoodShareUserPricing & {
  /** @deprecated use sharedFoodPrice */
  sharedPrice: number;
  /** @deprecated use sharedDeliveryFee */
  deliveryShare: number;
  /** @deprecated use displaySubtotal */
  totalPerUser: number;
  originalPrice: number;
};

export function buildAdminShareCostBreakdown(
  originalPrice: number,
  sharedPrice: number,
  deliveryShare: number,
  options?: {
    originalServiceFee?: number | null;
    promoDiscount?: number | null;
    taxRate?: number | null;
    promotionBadges?: ReadonlyArray<PromotionBadgeValue | string>;
    shareRaw?: Record<string, unknown> | null;
    fulfillmentMode?: 'delivery' | 'pickup';
  },
): FoodShareCostBreakdown {
  const pricing = pricingFromShareDoc(
    {
      originalPrice,
      sharedPrice,
      deliveryShare,
      promotionBadges: options?.promotionBadges,
      fulfillmentMode: options?.fulfillmentMode,
    },
    options?.shareRaw,
    {
      originalServiceFee: options?.originalServiceFee,
      promoDiscount: options?.promoDiscount,
      taxRate: options?.taxRate,
    },
  );
  return {
    ...pricing,
    originalPrice: pricing.originalFoodPrice,
    sharedPrice: pricing.sharedFoodPrice,
    deliveryShare: pricing.sharedDeliveryFee,
    totalPerUser: pricing.displaySubtotal,
  };
}

export function normalizeFoodShareCostBreakdown(
  breakdown: Record<string, unknown>,
  shareRaw?: Record<string, unknown> | null,
): FoodShareCostBreakdown {
  if (
    typeof breakdown.grandTotal === 'number' &&
    typeof breakdown.sharedFoodPrice === 'number'
  ) {
    return breakdown as unknown as FoodShareCostBreakdown;
  }

  const originalPrice =
    typeof breakdown.originalPrice === 'number'
      ? breakdown.originalPrice
      : typeof breakdown.originalFoodPrice === 'number'
        ? breakdown.originalFoodPrice
        : 0;
  const sharedPrice =
    typeof breakdown.sharedPrice === 'number'
      ? breakdown.sharedPrice
      : typeof breakdown.sharedFoodPrice === 'number'
        ? breakdown.sharedFoodPrice
        : typeof breakdown.userFoodShare === 'number'
          ? breakdown.userFoodShare
          : 0;
  const deliveryShare =
    typeof breakdown.deliveryShare === 'number'
      ? breakdown.deliveryShare
      : typeof breakdown.sharedDeliveryFee === 'number'
        ? breakdown.sharedDeliveryFee
        : typeof breakdown.userDeliveryShare === 'number'
          ? breakdown.userDeliveryShare
          : 0;

  return buildAdminShareCostBreakdown(
    originalPrice,
    sharedPrice,
    deliveryShare,
    {
      shareRaw,
      promotionBadges: Array.isArray(shareRaw?.promotionBadges)
        ? (shareRaw!.promotionBadges as PromotionBadgeValue[])
        : undefined,
    },
  );
}

export function formatShareCurrency(amount: number): string {
  return `CA$${amount.toFixed(2)}`;
}

export function formatTimeRemaining(expiresAtMs: number | null): string {
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) return 'Open';
  const mins = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 60000));
  if (mins <= 0) return 'Expired';
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m left` : `${hours}h left`;
}

/** @deprecated Use buildAdminShareCostBreakdown for admin swipe cards. */
export function computeFoodShareCostBreakdown(
  originalFoodPrice: number,
  deliveryCost: number,
) {
  const food = Math.max(0, originalFoodPrice);
  const delivery = Math.max(0, deliveryCost);
  const userFoodShare = Math.round(food * 0.5 * 100) / 100;
  const userDeliveryShare = Math.round(delivery * 0.5 * 100) / 100;
  return {
    originalFoodPrice: food,
    deliveryCost: delivery,
    userFoodShare,
    userDeliveryShare,
    totalPerUser: Math.round((userFoodShare + userDeliveryShare) * 100) / 100,
  };
}
