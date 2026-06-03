import {
  getRestaurantOrderPresentation,
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

/** Kitchen action rail derived from {@link getRestaurantOrderPresentation} only. */
export function merchantStatusFromOrder(order: OrderStageInput): MerchantOrderStatus {
  return getRestaurantOrderPresentation(order).merchantActionStatus;
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
