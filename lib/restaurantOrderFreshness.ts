import type { OrderStatus } from '@/services/orderService';
import { normalizeDeliveryStatus } from '@/services/deliveryStatus';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  isRestaurantPrePaymentCheckout,
} from '@/lib/restaurantLiveOrders';
import { deriveOrderStage } from '@/services/orderStage';

/** Restaurant dashboard visibility window — exactly 24 hours. */
export const RESTAURANT_ORDER_FRESH_MS = 24 * 60 * 60 * 1000;

export type OrderFreshnessInput = {
  createdAt?: unknown;
  createdAtMs?: number | null;
  status?: OrderStatus | string;
  deliveryStatus?: unknown;
  driverId?: string | null;
};

export function resolveOrderCreatedAtMs(order: OrderFreshnessInput): number | null {
  if (order.createdAtMs != null && Number.isFinite(order.createdAtMs)) {
    return order.createdAtMs;
  }
  return safeToMillis(order.createdAt);
}

/** True when `Date.now() - createdAtMs < 24h`. */
export function isOrderFresh(
  order: OrderFreshnessInput,
  nowMs: number = Date.now(),
): boolean {
  const createdMs = resolveOrderCreatedAtMs(order);
  if (createdMs == null || !Number.isFinite(createdMs)) return false;
  return nowMs - createdMs < RESTAURANT_ORDER_FRESH_MS;
}

/** True when the order is older than the 24h restaurant dashboard window. */
export function isOrderStale(
  order: OrderFreshnessInput,
  nowMs: number = Date.now(),
): boolean {
  const createdMs = resolveOrderCreatedAtMs(order);
  if (createdMs == null || !Number.isFinite(createdMs)) return false;
  return nowMs - createdMs >= RESTAURANT_ORDER_FRESH_MS;
}

export function filterFreshRestaurantOrders<T extends OrderFreshnessInput>(
  orders: T[],
  nowMs: number = Date.now(),
): T[] {
  return orders.filter((order) => isOrderFresh(order, nowMs));
}

export type RestaurantDashboardMetricsInput = OrderFreshnessInput & {
  status?: OrderStatus | string;
  paymentStatus?: string;
  totalPrice?: number;
};

/** Dashboard counters/cards — always scoped to the 24h window. */
export function computeRestaurantDashboardMetrics(
  orders: RestaurantDashboardMetricsInput[],
  nowMs: number = Date.now(),
): {
  total: number;
  active: number;
  completed: number;
  revenue: number;
} {
  const fresh = filterFreshRestaurantOrders(orders, nowMs);
  let active = 0;
  let completed = 0;
  let revenue = 0;

  for (const order of fresh) {
    if (isRestaurantPrePaymentCheckout(order)) {
      continue;
    }
    const stage = deriveOrderStage(order);
    if (stage === 'delivered') {
      completed += 1;
    } else if (stage !== 'cancelled') {
      active += 1;
    }
    revenue += typeof order.totalPrice === 'number' ? order.totalPrice : 0;
  }

  return { total: fresh.length, active, completed, revenue };
}

const ACTIVE_KITCHEN_STATUSES = new Set<OrderStatus>([
  'pending_driver',
  'driver_accepted',
  'driver_assigned',
  'arriving_restaurant',
  'picked_up_pending',
  'picked_up',
  'on_the_way',
  'arrived_customer',
]);

const ACTIVE_COURIER_STATUSES = new Set([
  'driver_assigned',
  'heading_to_restaurant',
  'arrived_restaurant',
  'picked_up',
  'on_the_way',
  'near_customer',
]);

/** In-flight delivery — must not be modified by restaurant UI cleanup. */
export function isRestaurantActiveDelivery(order: OrderFreshnessInput): boolean {
  const status = typeof order.status === 'string' ? (order.status as OrderStatus) : null;
  if (status != null && ACTIVE_KITCHEN_STATUSES.has(status)) return true;

  const courier = normalizeDeliveryStatus(order.deliveryStatus);
  if (!ACTIVE_COURIER_STATUSES.has(courier)) return false;
  if (status === 'delivered' || status === 'cancelled' || status === 'rejected') {
    return false;
  }
  return typeof order.driverId === 'string' && order.driverId.length > 0;
}
