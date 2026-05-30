import type { OrderStatus } from '@/services/orderService';

export type MerchantOrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered';

const ORDER_STEPS: MerchantOrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
];

export function normalizeMerchantStatus(status: OrderStatus): MerchantOrderStatus {
  if (status === 'accepted' || status === 'restaurant_accepted') return 'accepted';
  if (status === 'ready' || status === 'ready_for_pickup') return 'ready';
  if (status === 'awaiting_payment') return 'pending';
  if (status === 'payment_confirmed') return 'pending';
  if (status === 'cancelled' || status === 'rejected') return 'delivered';
  if (
    status === 'pending' ||
    status === 'preparing' ||
    status === 'picked_up' ||
    status === 'delivered'
  ) {
    return status;
  }
  return 'pending';
}

export function getOrderStepIndex(status: MerchantOrderStatus): number {
  return ORDER_STEPS.indexOf(status);
}

export function canTransition(
  current: MerchantOrderStatus,
  next: MerchantOrderStatus,
): boolean {
  const currentIdx = getOrderStepIndex(current);
  const nextIdx = getOrderStepIndex(next);
  return nextIdx === currentIdx + 1;
}
