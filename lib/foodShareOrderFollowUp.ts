import type { FoodShareMatchLifecycle } from '@/types/foodShare';

export const FOOD_SHARE_TRACK_STEPS = [
  'Preparing',
  'Picked up',
  'On the way',
  'Delivered',
] as const;

export type FoodShareTrackStep = (typeof FOOD_SHARE_TRACK_STEPS)[number];

/** Map match lifecycle / deliveryStatus → track step index (0–3). */
export function foodShareTrackStepIndex(
  lifecycle: string | null | undefined,
  deliveryStatus?: string | null,
): number {
  const lc = String(lifecycle ?? '').toUpperCase();
  const ds = String(deliveryStatus ?? '').toLowerCase();

  if (
    lc === 'DELIVERED' ||
    lc === 'COMPLETED' ||
    ds === 'delivered' ||
    ds === 'completed'
  ) {
    return 3;
  }
  if (
    lc === 'PICKED_UP' ||
    ds === 'picked_up' ||
    ds === 'on_the_way' ||
    ds === 'in_transit' ||
    ds === 'arrived_customer'
  ) {
    return 2;
  }
  if (
    lc === 'DRIVER_ASSIGNED' ||
    ds === 'driver_assigned' ||
    ds === 'driver_at_restaurant' ||
    ds === 'ready_for_pickup'
  ) {
    return 1;
  }
  return 0;
}

export function foodShareDeliveryStatusLabel(
  lifecycle: string | null | undefined,
  deliveryStatus?: string | null,
): string {
  const step = FOOD_SHARE_TRACK_STEPS[foodShareTrackStepIndex(lifecycle, deliveryStatus)];
  const lc = String(lifecycle ?? '').toUpperCase();
  if (lc === 'CANCELLED') return 'Cancelled';
  if (lc === 'WAITING_FOR_PAYMENT' || lc === 'WAITING_FOR_PAYMENT_CONFIRMATION') {
    return 'Awaiting payment';
  }
  if (lc === 'PAYMENT_CONFIRMED') return 'Payment confirmed';
  if (lc === 'WAITING_FOR_PARTNER' || lc === 'CREATED') return 'Matching';
  return step;
}

/** Map food-share lifecycle → marketplace-like profile status fields. */
export function foodShareLifecycleToProfileFields(lifecycle: string): {
  status: string;
  deliveryStatus: string;
  paymentStatus: string;
} {
  const lc = lifecycle.toUpperCase() as FoodShareMatchLifecycle | string;
  switch (lc) {
    case 'CANCELLED':
      return { status: 'cancelled', deliveryStatus: 'cancelled', paymentStatus: 'paid' };
    case 'DELIVERED':
    case 'COMPLETED':
      return { status: 'completed', deliveryStatus: 'delivered', paymentStatus: 'paid' };
    case 'PICKED_UP':
      return { status: 'on_the_way', deliveryStatus: 'picked_up', paymentStatus: 'paid' };
    case 'DRIVER_ASSIGNED':
      return { status: 'driver_assigned', deliveryStatus: 'driver_assigned', paymentStatus: 'paid' };
    case 'ORDER_PLACED':
    case 'MATCHED':
      return { status: 'preparing', deliveryStatus: '', paymentStatus: 'paid' };
    case 'PAYMENT_CONFIRMED':
      return { status: 'payment_confirmed', deliveryStatus: '', paymentStatus: 'paid' };
    case 'WAITING_FOR_PAYMENT':
    case 'WAITING_FOR_PAYMENT_CONFIRMATION':
      return { status: 'awaiting_payment', deliveryStatus: '', paymentStatus: 'unpaid' };
    default:
      return { status: 'preparing', deliveryStatus: '', paymentStatus: 'paid' };
  }
}

export const FOOD_SHARE_ISSUE_REASONS = [
  'Food not arrived',
  'Wrong order',
  'Driver issue',
  'Other',
] as const;

export type FoodShareIssueReason = (typeof FOOD_SHARE_ISSUE_REASONS)[number];
