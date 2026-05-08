import type { OrderStatus } from '@/services/orderService';

export const DRIVER_TIMELINE_STATUSES: OrderStatus[] = [
  'driver_assigned',
  'arriving_restaurant',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'delivered',
];

export function formatOrderStatus(status: OrderStatus): string {
  switch (status) {
    case 'driver_accepted':
    case 'driver_assigned':
      return 'Heading to restaurant';
    case 'arriving_restaurant':
      return 'Arrived at restaurant';
    case 'picked_up_pending':
      return 'Preparing pickup';
    case 'picked_up':
      return 'Picked up';
    case 'on_the_way':
      return 'On the way';
    case 'arrived_customer':
      return 'Arrived at customer';
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
      label: 'Arrived at restaurant',
      nextStatus: 'arriving_restaurant',
      successText: 'Heading to restaurant',
    };
  }
  if (status === 'arriving_restaurant') {
    return {
      label: 'Picked up',
      nextStatus: 'picked_up',
      successText: 'Order picked up',
    };
  }
  if (status === 'picked_up') {
    return {
      label: 'Start delivering',
      nextStatus: 'on_the_way',
      successText: 'Delivering',
    };
  }
  if (status === 'on_the_way') {
    return {
      label: 'Arrived at customer',
      nextStatus: 'arrived_customer',
      successText: 'Arrived at customer',
    };
  }
  if (status === 'arrived_customer') {
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
