import type { FoodShareCostBreakdown } from '@/types/foodShare';

export function buildAdminShareCostBreakdown(
  originalPrice: number,
  sharedPrice: number,
  deliveryShare: number,
): FoodShareCostBreakdown {
  const original = Math.max(0, originalPrice);
  const food = Math.max(0, sharedPrice);
  const delivery = Math.max(0, deliveryShare);
  return {
    originalPrice: original,
    sharedPrice: food,
    deliveryShare: delivery,
    totalPerUser: Math.round((food + delivery) * 100) / 100,
  };
}

export function formatShareCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
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
