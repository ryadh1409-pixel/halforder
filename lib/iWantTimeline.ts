import { isOrderCompleted } from '@/lib/orderCompletion';
import { isIWantOrderData } from '@/types/iWant';
import type { OrderStageInput } from '@/services/orderStage';

export type IWantTimelineStepKey =
  | 'driver_accepted'
  | 'going_to_restaurant'
  | 'purchasing'
  | 'order_collected'
  | 'on_the_way'
  | 'delivered';

export type IWantTimelineStep = {
  key: IWantTimelineStepKey;
  label: string;
};

/** Concierge delivery timeline — no restaurant-preparing stage. */
export const I_WANT_TIMELINE_STEPS: IWantTimelineStep[] = [
  { key: 'driver_accepted', label: 'Driver Accepted' },
  { key: 'going_to_restaurant', label: 'Driver Going To Restaurant' },
  { key: 'purchasing', label: 'Purchasing Your Order' },
  { key: 'order_collected', label: 'Order Collected' },
  { key: 'on_the_way', label: 'On The Way' },
  { key: 'delivered', label: 'Delivered' },
];

export type IWantTimelineRenderStep = {
  id: IWantTimelineStepKey;
  label: string;
  completed: boolean;
  current: boolean;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isIWantOrder(
  order: OrderStageInput | Record<string, unknown> | null | undefined,
): boolean {
  if (!order) return false;
  if (isIWantOrderData(order as Record<string, unknown>)) return true;
  const restaurantId =
    typeof (order as { restaurantId?: unknown }).restaurantId === 'string'
      ? String((order as { restaurantId: string }).restaurantId)
      : '';
  return restaurantId.startsWith('i_want_');
}

/**
 * Map live order/delivery status onto the I Want timeline.
 * Intentionally skips restaurant preparing / accepted stages.
 */
export function resolveIWantTimelineStep(
  order: OrderStageInput,
): IWantTimelineStepKey | 'waiting' | 'cancelled' {
  const status = norm(order.status);
  const delivery = norm(order.deliveryStatus);
  const combined = `${status} ${delivery}`;

  if (
    status === 'cancelled' ||
    status === 'canceled' ||
    delivery === 'cancelled' ||
    delivery === 'canceled'
  ) {
    return 'cancelled';
  }

  if (isOrderCompleted(order) || delivery === 'delivered' || status === 'delivered') {
    return 'delivered';
  }

  if (
    /on_the_way|heading_to_customer|near_customer|arrived_customer|out_for_delivery/.test(
      combined,
    )
  ) {
    return 'on_the_way';
  }

  if (/picked_up|order_collected|collected/.test(combined)) {
    return 'order_collected';
  }

  if (
    /driver_at_restaurant|arrived_restaurant|purchasing|at_restaurant/.test(combined)
  ) {
    return 'purchasing';
  }

  if (
    /heading_to_restaurant|arriving_restaurant|going_to_restaurant|en_route_restaurant/.test(
      combined,
    )
  ) {
    return 'going_to_restaurant';
  }

  if (
    /driver_assigned|driver_accepted|driver_on_way|accepted/.test(combined) ||
    Boolean(order.driverId || order.assignedDriverId)
  ) {
    return 'driver_accepted';
  }

  return 'waiting';
}

export function buildIWantTimelineRenderSteps(
  order: OrderStageInput,
): IWantTimelineRenderStep[] {
  const active = resolveIWantTimelineStep(order);
  if (active === 'cancelled') {
    return I_WANT_TIMELINE_STEPS.map((step) => ({
      id: step.key,
      label: step.label,
      completed: false,
      current: false,
    }));
  }

  const terminal = active === 'delivered' || isOrderCompleted(order);
  const activeIndex =
    active === 'waiting'
      ? -1
      : I_WANT_TIMELINE_STEPS.findIndex((s) => s.key === active);

  return I_WANT_TIMELINE_STEPS.map((step, index) => {
    if (terminal) {
      return {
        id: step.key,
        label: step.label,
        completed: true,
        current: false,
      };
    }
    return {
      id: step.key,
      label: step.label,
      completed: activeIndex >= 0 && index < activeIndex,
      current: index === activeIndex,
    };
  });
}

export function iWantTrackHeaderTitle(order: OrderStageInput): string {
  const step = resolveIWantTimelineStep(order);
  switch (step) {
    case 'waiting':
      return 'Finding a driver';
    case 'driver_accepted':
      return 'Driver accepted';
    case 'going_to_restaurant':
      return 'Driver going to restaurant';
    case 'purchasing':
      return 'Purchasing your order';
    case 'order_collected':
      return 'Order collected';
    case 'on_the_way':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Order cancelled';
    default:
      return 'Tracking your order';
  }
}
