import { canCustomerCancelMarketplaceOrder } from '@/lib/customerOrderCancelUx';
import type { OrderStageInput } from '@/services/orderStage';

export type ProfileOrderBadgeTone = 'orange' | 'blue' | 'green' | 'red' | 'neutral';

export function profileOrderStatusLabel(
  status: string,
  deliveryStatus?: string | null,
  paymentStatus?: string | null,
): string {
  const ps = (paymentStatus ?? '').trim().toLowerCase();
  const paid = ps === 'paid';

  if (paid && (status === 'awaiting_payment' || status === 'payment_processing')) {
    return 'Payment confirmed';
  }

  const ds = (deliveryStatus ?? '').trim();
  if (ds === 'waiting_driver') return 'Finding Driver';
  if (status === 'payment_processing') return 'Processing payment';
  if (status === 'delivered' || ds === 'delivered') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'pending_driver') return 'Finding Driver';
  if (status === 'driver_assigned' || ds === 'driver_assigned') return 'Driver assigned';
  if (status === 'picked_up') return 'On the Way';
  if (
    status === 'arriving_restaurant' ||
    status === 'picked_up_pending' ||
    status === 'on_the_way' ||
    status === 'delivering' ||
    status === 'arrived_customer' ||
    ds === 'on_the_way' ||
    ds === 'delivering' ||
    ds === 'heading_to_customer' ||
    ds === 'driver_assigned'
  ) {
    return 'On the Way';
  }
  if (status === 'accepted' || status === 'restaurant_accepted' || status === 'preparing') {
    return 'Preparing';
  }
  if (status === 'ready' || status === 'ready_for_pickup') return 'Ready for pickup';
  if (status === 'payment_confirmed') return 'Payment confirmed';
  if (status === 'awaiting_payment') return paid ? 'Payment confirmed' : 'Awaiting payment';
  return 'Pending';
}

export function profileOrderBadgeTone(
  status: string,
  deliveryStatus?: string | null,
): ProfileOrderBadgeTone {
  const ds = (deliveryStatus ?? '').trim();
  if (status === 'delivered' || ds === 'delivered') return 'green';
  if (status === 'cancelled') return 'red';
  if (status === 'payment_processing') return 'orange';
  if (status === 'pending_driver' || ds === 'waiting_driver' || status === 'driver_assigned') {
    return 'orange';
  }
  if (status === 'picked_up') return 'orange';
  switch (status) {
    case 'driver_assigned':
    case 'arriving_restaurant':
    case 'picked_up_pending':
    case 'on_the_way':
    case 'arrived_customer':
      return 'orange';
    case 'awaiting_payment':
    case 'payment_processing':
    case 'pending_driver':
    case 'accepted':
    case 'restaurant_accepted':
    case 'preparing':
    case 'ready':
    case 'ready_for_pickup':
      return 'orange';
    default:
      return 'neutral';
  }
}

export function profileOrderStatusIcon(
  status: string,
  deliveryStatus?: string | null,
): string {
  const ds = (deliveryStatus ?? '').trim();
  if (status === 'delivered' || ds === 'delivered') return 'check-circle';
  if (status === 'cancelled') return 'highlight-off';
  if (status === 'payment_processing') return 'payments';
  if (status === 'pending_driver') return 'local-shipping';
  if (ds === 'waiting_driver') return 'local-shipping';
  if (status === 'driver_assigned' || ds === 'driver_assigned') return 'person-pin-circle';
  if (
    status === 'picked_up' ||
    status === 'on_the_way' ||
    status === 'arrived_customer' ||
    ds === 'on_the_way'
  ) {
    return 'delivery-dining';
  }
  return 'schedule';
}

export function profileOrderStatusActive(
  status: string,
  deliveryStatus?: string | null,
): boolean {
  const ds = (deliveryStatus ?? '').trim();
  if (status === 'delivered' || status === 'cancelled' || ds === 'delivered') return false;
  return (
    status === 'payment_processing' ||
    status === 'pending_driver' ||
    ds === 'waiting_driver' ||
    status === 'driver_assigned' ||
    ds === 'driver_assigned' ||
    status === 'picked_up' ||
    status === 'on_the_way' ||
    status === 'delivering' ||
    ds === 'on_the_way' ||
    ds === 'delivering' ||
    status === 'arrived_customer' ||
    status === 'preparing'
  );
}

export function canCancelProfileOrder(
  order: OrderStageInput & { status?: string; deliveryStatus?: string | null; paymentStatus?: string | null },
): boolean {
  return canCustomerCancelMarketplaceOrder(order);
}
