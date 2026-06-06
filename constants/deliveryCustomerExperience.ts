/**
 * Customer-facing delivery phases (Uber Eats–style labels).
 * Derived from live Firestore `orders/{id}` fields via {@link resolveCustomerTrackStep}.
 */
import {
  customerTrackHeaderTitle,
  customerTrackProgress,
  customerTrackStepSubtitle,
  resolveCustomerTrackStep,
  type CustomerTrackPhase,
} from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';

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

function mapTrackStepToCustomerPhase(step: CustomerTrackPhase): CustomerDeliveryPhase {
  switch (step) {
    case 'order_placed':
    case 'restaurant_accepted':
    case 'preparing':
      return 'payment_confirmed';
    case 'ready_for_pickup':
      return 'finding_driver';
    case 'driver_assigned':
      return 'driver_assigned';
    case 'at_restaurant':
      return 'arriving_restaurant';
    case 'picked_up':
      return 'heading_to_customer';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'payment_confirmed';
  }
}

export function resolveCustomerDeliveryPhase(input: OrderStageInput): CustomerPhaseInfo {
  const step = resolveCustomerTrackStep(input);
  return {
    phase: mapTrackStepToCustomerPhase(step),
    title: customerTrackHeaderTitle(step),
    subtitle: customerTrackStepSubtitle(step),
    progress: customerTrackProgress(step),
  };
}
