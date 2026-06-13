import type { FoodShareMatchLifecycle } from '@/types/foodShare';

export const FOOD_SHARE_LIFECYCLE_STEPS: FoodShareMatchLifecycle[] = [
  'CREATED',
  'WAITING_FOR_PARTNER',
  'WAITING_FOR_PAYMENT',
  'PAYMENT_CONFIRMED',
  'MATCHED',
  'ORDER_PLACED',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'COMPLETED',
];

const LABELS: Record<FoodShareMatchLifecycle, string> = {
  CREATED: 'Share created',
  WAITING_FOR_PARTNER: 'Waiting for partner',
  WAITING_FOR_PAYMENT: 'Waiting for payment',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  MATCHED: 'Matched',
  ORDER_PLACED: 'Order placed',
  DRIVER_ASSIGNED: 'Driver assigned',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function foodShareLifecycleLabel(
  lifecycle: FoodShareMatchLifecycle | string | null | undefined,
): string {
  if (!lifecycle) return 'Pending';
  const key = lifecycle.toString().toUpperCase() as FoodShareMatchLifecycle;
  return LABELS[key] ?? lifecycle.toString();
}

export function foodShareLifecycleIndex(
  lifecycle: FoodShareMatchLifecycle | string | null | undefined,
): number {
  if (!lifecycle) return 0;
  const key = lifecycle.toString().toUpperCase() as FoodShareMatchLifecycle;
  const idx = FOOD_SHARE_LIFECYCLE_STEPS.indexOf(key);
  return idx >= 0 ? idx : 0;
}
