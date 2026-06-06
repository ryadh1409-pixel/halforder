import { isRestaurantPrePaymentCheckout } from '@/lib/restaurantLiveOrders';
import type { RestaurantOrderVisibilityInput } from '@/lib/restaurantLiveOrders';
import {
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';
import { isTerminalMarketplaceOrder } from '@/lib/orderTerminalStatus';

/** Canonical stages shown on the restaurant live dashboard subscription. */
export const ACTIVE_RESTAURANT_DERIVED_STAGES: readonly DerivedOrderStage[] = [
  'awaiting_restaurant',
  'preparing',
  'driver_assignment',
  'driver_assigned',
  'picked_up',
] as const;

const ACTIVE_RESTAURANT_DERIVED_STAGE_SET = new Set<DerivedOrderStage>(
  ACTIVE_RESTAURANT_DERIVED_STAGES,
);

export type RestaurantOrderArchiveFields = {
  archivedByRestaurant?: boolean;
  hiddenForRestaurant?: boolean;
};

export function isActiveRestaurantDerivedStage(stage: DerivedOrderStage): boolean {
  return ACTIVE_RESTAURANT_DERIVED_STAGE_SET.has(stage);
}

/**
 * Client-side guard for kitchen Active tab — excludes terminal/archived rows
 * and unpaid checkout snapshots.
 */
export function isActiveRestaurantOrder(
  order: OrderStageInput & RestaurantOrderArchiveFields,
): boolean {
  if (isTerminalMarketplaceOrder(order)) return false;
  if (order.archivedByRestaurant === true || order.hiddenForRestaurant === true) {
    return false;
  }
  return isActiveRestaurantDerivedStage(deriveOrderStage(order));
}

/** Paid marketplace orders for the restaurant dashboard listener (includes delivered in 24h). */
export function isRestaurantDashboardOrder(
  order: OrderStageInput & RestaurantOrderArchiveFields,
): boolean {
  if (isRestaurantPrePaymentCheckout(order as RestaurantOrderVisibilityInput)) return false;
  return deriveOrderStage(order) !== 'awaiting_payment';
}
