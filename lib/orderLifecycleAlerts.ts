import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import {
  deriveOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

export type CustomerLifecycleAlertKey =
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'driver_assigned'
  | 'picked_up'
  | 'delivered';

export type RestaurantLifecycleAlertKey =
  | 'new_paid_order'
  | 'driver_assigned'
  | 'picked_up'
  | 'delivered';

export type DriverLifecycleAlertKey =
  | 'new_delivery_available'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'delivered';

export const CUSTOMER_LIFECYCLE_ALERTS: Record<
  CustomerLifecycleAlertKey,
  { title: string; message: string }
> = {
  accepted: {
    title: 'Order Accepted',
    message: 'The restaurant accepted your order.',
  },
  preparing: {
    title: 'Preparing Order',
    message: 'Your food is being prepared.',
  },
  ready_for_pickup: {
    title: 'Order Ready',
    message: 'Your order is ready for pickup.',
  },
  driver_assigned: {
    title: 'Driver Assigned',
    message: 'A driver is heading to the restaurant.',
  },
  picked_up: {
    title: 'Order Picked Up',
    message: 'Your order is on the way.',
  },
  delivered: {
    title: 'Delivered',
    message: 'Enjoy your meal!',
  },
};

export const RESTAURANT_LIFECYCLE_ALERTS: Record<
  RestaurantLifecycleAlertKey,
  { title: string; message: string }
> = {
  new_paid_order: {
    title: 'New Order',
    message: 'A new order requires attention.',
  },
  driver_assigned: {
    title: 'Driver Assigned',
    message: 'A driver accepted this delivery.',
  },
  picked_up: {
    title: 'Order Picked Up',
    message: 'The order left the restaurant.',
  },
  delivered: {
    title: 'Order Delivered',
    message: 'Delivery completed successfully.',
  },
};

export const DRIVER_LIFECYCLE_ALERTS: Record<
  Exclude<DriverLifecycleAlertKey, 'new_delivery_available'>,
  { title: string; message: string }
> = {
  ready_for_pickup: {
    title: 'Order Ready',
    message: 'Restaurant marked the order ready.',
  },
  picked_up: {
    title: 'Pickup Confirmed',
    message: 'Proceed to customer.',
  },
  delivered: {
    title: 'Delivery Complete',
    message: 'Earnings have been added.',
  },
};

export function resolveCustomerLifecycleAlertKey(
  order: OrderStageInput | null | undefined,
): CustomerLifecycleAlertKey | null {
  if (!order) return null;
  const step = resolveCustomerTrackStep(order);
  switch (step) {
    case 'restaurant_accepted':
      return 'accepted';
    case 'preparing':
      return 'preparing';
    case 'ready_for_pickup':
      return 'ready_for_pickup';
    case 'driver_assigned':
    case 'driver_at_restaurant':
      return 'driver_assigned';
    case 'picked_up':
      return 'picked_up';
    case 'delivered':
      return 'delivered';
    default:
      return null;
  }
}

export function resolveRestaurantLifecycleAlertKey(
  order: OrderStageInput | null | undefined,
): RestaurantLifecycleAlertKey | null {
  if (!order) return null;
  const stage = deriveOrderStage(order);
  switch (stage) {
    case 'awaiting_restaurant':
      return 'new_paid_order';
    case 'driver_assigned':
      return 'driver_assigned';
    case 'picked_up':
      return 'picked_up';
    case 'delivered':
      return 'delivered';
    default:
      return null;
  }
}

export function resolveDriverActiveLifecycleAlertKey(
  order: OrderStageInput | null | undefined,
): Exclude<DriverLifecycleAlertKey, 'new_delivery_available'> | null {
  if (!order) return null;
  const stage = deriveOrderStage(order);
  if (stage === 'delivered') return 'delivered';
  if (stage === 'picked_up') return 'picked_up';

  const courier = normalizeMarketplaceDeliveryStatus(order.deliveryStatus);
  if (courier === 'ready_for_pickup') return 'ready_for_pickup';
  return null;
}

export function orderLifecycleDependencyKey(
  order: OrderStageInput | null | undefined,
): string {
  if (!order) return '';
  return [
    (order as { id?: string }).id ?? '',
    order.status ?? '',
    order.deliveryStatus ?? '',
    order.paymentStatus ?? '',
    order.driverId ?? '',
    order.assignedDriverId ?? '',
    order.pickedUpAtMs ?? '',
    order.deliveredAtMs ?? '',
    order.completedAtMs ?? '',
  ].join('|');
}
