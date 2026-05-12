/**
 * Customer-facing delivery phases (Uber Eats–style labels).
 * Maps existing Firestore `status` + `paymentStatus` + marketplace `deliveryStatus` to one UX phase.
 */
import type { DeliveryStatus } from '@/services/deliveryStatus';
import type { OrderStatus } from '@/services/orderService';

export type CustomerDeliveryPhase =
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'finding_driver'
  | 'driver_assigned'
  | 'arriving_restaurant'
  | 'picked_up'
  | 'heading_to_customer'
  | 'arrived_nearby'
  | 'delivered'
  | 'cancelled';

export type CustomerPhaseInfo = {
  phase: CustomerDeliveryPhase;
  title: string;
  subtitle: string;
  /** 0–1 for progress rings */
  progress: number;
};

const PHASE_ORDER: CustomerDeliveryPhase[] = [
  'awaiting_payment',
  'payment_confirmed',
  'finding_driver',
  'driver_assigned',
  'arriving_restaurant',
  'picked_up',
  'heading_to_customer',
  'arrived_nearby',
  'delivered',
];

const PHASE_COPY: Record<
  CustomerDeliveryPhase,
  { title: string; subtitle: string }
> = {
  awaiting_payment: {
    title: 'Awaiting payment',
    subtitle: 'Complete checkout to place your order.',
  },
  payment_confirmed: {
    title: 'Payment confirmed',
    subtitle: 'Restaurant will start preparing soon.',
  },
  finding_driver: {
    title: 'Finding a driver',
    subtitle: 'Matching you with the best available courier.',
  },
  driver_assigned: {
    title: 'Driver assigned',
    subtitle: 'Your courier is heading to the restaurant.',
  },
  arriving_restaurant: {
    title: 'At the restaurant',
    subtitle: 'Your driver arrived for pickup.',
  },
  picked_up: {
    title: 'Picked up',
    subtitle: 'Your order is on the way.',
  },
  heading_to_customer: {
    title: 'On the way',
    subtitle: 'Driving to your address.',
  },
  arrived_nearby: {
    title: 'Driver nearby',
    subtitle: 'Your driver is almost at your door.',
  },
  delivered: {
    title: 'Delivered',
    subtitle: 'Enjoy your meal.',
  },
  cancelled: {
    title: 'Order cancelled',
    subtitle: 'This delivery is no longer active.',
  },
};

function progressFor(phase: CustomerDeliveryPhase): number {
  if (phase === 'cancelled') return 0;
  const i = PHASE_ORDER.indexOf(phase);
  if (i < 0) return 0.08;
  return Math.min(1, (i + 1) / PHASE_ORDER.length);
}

function phaseFromDeliveryAndStatus(
  ds: DeliveryStatus,
  status: OrderStatus,
): CustomerDeliveryPhase | null {
  if (ds === 'cancelled' || status === 'cancelled') return 'cancelled';
  if (ds === 'delivered' || status === 'delivered') return 'delivered';
  if (ds === 'near_customer' || status === 'arrived_customer') return 'arrived_nearby';
  if (ds === 'on_the_way' || status === 'on_the_way') return 'heading_to_customer';
  if (ds === 'picked_up' || status === 'picked_up') return 'picked_up';
  if (ds === 'arrived_restaurant' || status === 'arriving_restaurant') return 'arriving_restaurant';
  if (
    ds === 'heading_to_restaurant' ||
    ds === 'driver_assigned' ||
    status === 'driver_accepted' ||
    status === 'driver_assigned'
  ) {
    return 'driver_assigned';
  }
  if (ds === 'waiting_driver' || status === 'pending_driver') return 'finding_driver';
  return null;
}

export function resolveCustomerDeliveryPhase(input: {
  status: OrderStatus;
  paymentStatus: string;
  deliveryStatus: DeliveryStatus;
  /** When set, customer has an assigned courier */
  driverId?: string | null;
}): CustomerPhaseInfo {
  const { status, paymentStatus, deliveryStatus, driverId } = input;

  if (status === 'cancelled' || paymentStatus === 'failed') {
    const phase: CustomerDeliveryPhase = 'cancelled';
    return { phase, ...PHASE_COPY[phase], progress: 0 };
  }

  const derived = phaseFromDeliveryAndStatus(deliveryStatus, status);
  if (derived) {
    return { phase: derived, ...PHASE_COPY[derived], progress: progressFor(derived) };
  }

  const paid = paymentStatus === 'paid';
  const hasDriver = typeof driverId === 'string' && driverId.length > 0;

  if (
    paid &&
    !hasDriver &&
    (status === 'restaurant_accepted' ||
      status === 'preparing' ||
      status === 'ready' ||
      status === 'ready_for_pickup')
  ) {
    const phase: CustomerDeliveryPhase = 'payment_confirmed';
    return {
      phase,
      title: 'Restaurant is preparing',
      subtitle: 'We will match a driver when your order is almost ready.',
      progress: progressFor('payment_confirmed'),
    };
  }
  if (
    paymentStatus === 'unpaid' ||
    status === 'awaiting_payment' ||
    status === 'payment_processing' ||
    status === 'payment_failed'
  ) {
    const phase: CustomerDeliveryPhase = paid ? 'payment_confirmed' : 'awaiting_payment';
    return { phase, ...PHASE_COPY[phase], progress: progressFor(phase) };
  }

  if (paid) {
    if (status === 'pending_driver' || status === 'pending') {
      const phase: CustomerDeliveryPhase = 'finding_driver';
      return { phase, ...PHASE_COPY[phase], progress: progressFor(phase) };
    }
    const phase: CustomerDeliveryPhase = 'driver_assigned';
    return { phase, ...PHASE_COPY[phase], progress: progressFor(phase) };
  }

  const phase: CustomerDeliveryPhase = 'payment_confirmed';
  return { phase, ...PHASE_COPY[phase], progress: 0.12 };
}
