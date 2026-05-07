import type { OrderStatus } from '@/services/orderService';

export const DRIVER_TIMELINE_STATUSES: OrderStatus[] = [
  'driver_assigned',
  'driver_accepted',
  'arriving_restaurant',
  'picked_up_pending',
  'picked_up',
  'on_the_way',
  'delivered',
];

export function formatOrderStatus(status: OrderStatus): string {
  switch (status) {
    case 'driver_accepted':
      return 'Driver accepted';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'arriving_restaurant':
      return 'Arriving at restaurant';
    case 'picked_up_pending':
      return 'Picked up pending';
    case 'picked_up':
      return 'Picked up';
    case 'on_the_way':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

export function getNextDriverAction(status: OrderStatus):
  | { label: string; nextStatus: OrderStatus; successText: string }
  | null {
  if (status === 'driver_accepted' || status === 'driver_assigned') {
    return {
      label: 'Arrive at restaurant',
      nextStatus: 'arriving_restaurant',
      successText: 'Arrived at restaurant',
    };
  }
  if (status === 'arriving_restaurant') {
    return {
      label: 'Confirm pickup pending',
      nextStatus: 'picked_up_pending',
      successText: 'Pickup confirmed',
    };
  }
  if (status === 'picked_up_pending') {
    return {
      label: 'Mark picked up',
      nextStatus: 'picked_up',
      successText: 'Order picked up',
    };
  }
  if (status === 'picked_up') {
    return {
      label: 'Start delivery',
      nextStatus: 'on_the_way',
      successText: 'Delivery started',
    };
  }
  if (status === 'on_the_way') {
    return {
      label: 'Mark delivered',
      nextStatus: 'delivered',
      successText: 'Delivered',
    };
  }
  return null;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
