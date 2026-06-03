import {
  deriveOrderStage,
  type DerivedOrderStage,
} from '@/services/orderStage';
import type { OrderStageInput } from '@/services/orderStage';
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

/** Kitchen action rail derived from canonical order stage (not raw Firestore status). */
export function merchantStatusFromOrder(
  order: OrderStageInput,
): MerchantOrderStatus {
  const stage = deriveOrderStage(order);
  const status = typeof order.status === 'string' ? order.status : '';

  switch (stage) {
    case 'awaiting_payment':
    case 'awaiting_restaurant':
      return 'pending';
    case 'preparing':
      if (status === 'preparing') return 'preparing';
      return 'accepted';
    case 'driver_assignment':
      return 'ready';
    case 'driver_assigned':
      return 'ready';
    case 'picked_up':
      return 'picked_up';
    case 'delivered':
    case 'cancelled':
      return 'delivered';
    default:
      return 'pending';
  }
}

/** @deprecated Use {@link merchantStatusFromOrder} — kept for gradual migration. */
export function normalizeMerchantStatus(status: OrderStatus): MerchantOrderStatus {
  return merchantStatusFromOrder({ status, paymentStatus: 'paid' });
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
