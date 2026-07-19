import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { normalizeDeliveryStatus } from '@/services/deliveryStatus';

export const FULFILLMENT_TIMELINE: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting_payment', label: 'Awaiting payment' },
  { status: 'pending_driver', label: 'Finding a driver' },
  { status: 'pending', label: 'Order placed' },
  { status: 'restaurant_accepted', label: 'Restaurant accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready_for_pickup', label: 'Ready for pickup' },
  { status: 'picked_up', label: 'Picked up' },
  { status: 'on_the_way', label: 'On the way' },
  { status: 'arrived_customer', label: 'Arrived nearby' },
  { status: 'delivered', label: 'Delivered' },
];

export function fulfillmentStatusIndex(
  status: OrderStatus | undefined,
  paymentStatus?: string,
): number {
  if (!status || status === 'rejected' || status === 'payment_failed') return -1;
  const paid = paymentStatus === 'paid';
  if (
    paid &&
    (status === 'awaiting_payment' || status === 'payment_processing')
  ) {
    return Math.max(0, FULFILLMENT_TIMELINE.findIndex((s) => s.status === 'pending'));
  }
  if (status === 'payment_processing') {
    return Math.max(0, FULFILLMENT_TIMELINE.findIndex((s) => s.status === 'awaiting_payment'));
  }
  const i = FULFILLMENT_TIMELINE.findIndex((s) => s.status === status);
  return i >= 0 ? i : 0;
}

export function chipForFulfillment(status: OrderStatus | undefined): { bg: string; fg: string } {
  switch (status) {
    case 'awaiting_payment':
    case 'payment_processing':
      return { bg: 'rgba(148,163,184,0.35)', fg: '#B7BDC9' };
    case 'payment_failed':
      return { bg: 'rgba(239,68,68,0.25)', fg: '#EF4444' };
    case 'pending_driver':
      return { bg: 'rgba(234,179,8,0.25)', fg: '#F59E0B' };
    case 'pending':
      return { bg: 'rgba(245,158,11,0.2)', fg: '#FCD34D' };
    case 'restaurant_accepted':
    case 'preparing':
      return { bg: 'rgba(59,130,246,0.25)', fg: '#BFDBFE' };
    case 'ready_for_pickup':
      return { bg: 'rgba(34,197,94,0.2)', fg: '#22C55E' };
    case 'picked_up':
    case 'on_the_way':
    case 'arrived_customer':
      return { bg: 'rgba(56,189,248,0.22)', fg: '#E0F2FE' };
    case 'delivered':
    case 'completed':
      return { bg: 'rgba(34,197,94,0.28)', fg: '#DCFCE7' };
    case 'cancelled':
    case 'rejected':
      return { bg: 'rgba(248,113,113,0.2)', fg: '#EF4444' };
    default:
      return { bg: 'rgba(255,255,255,0.08)', fg: '#7D8493' };
  }
}

export function paymentBadge(paymentStatus: RestaurantOrder['paymentStatus']): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (paymentStatus) {
    case 'paid':
      return { label: 'Paid', bg: 'rgba(34,197,94,0.25)', fg: '#22C55E' };
    case 'processing':
      return { label: 'Processing', bg: 'rgba(245,158,11,0.2)', fg: '#F59E0B' };
    case 'failed':
      return { label: 'Payment issue', bg: 'rgba(239,68,68,0.25)', fg: '#EF4444' };
    case 'refunded':
      return { label: 'Refunded', bg: 'rgba(148,163,184,0.25)', fg: '#B7BDC9' };
    default:
      return { label: 'Unpaid', bg: 'rgba(148,163,184,0.2)', fg: '#7D8493' };
  }
}

export function driverStatusLabel(order: RestaurantOrder): string {
  const d = normalizeDeliveryStatus(order.deliveryStatus);
  const map: Record<string, string> = {
    waiting_driver: 'Finding driver',
    driver_assigned: 'Driver assigned',
    heading_to_restaurant: 'Heading to restaurant',
    arrived_restaurant: 'At restaurant',
    picked_up: 'Picked up',
    on_the_way: 'On the way',
    near_customer: 'Nearby',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };
  return map[d] ?? String(d).replace(/_/g, ' ');
}
