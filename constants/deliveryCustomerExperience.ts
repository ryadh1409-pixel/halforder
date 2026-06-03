/**
 * Customer-facing delivery phases (Uber Eats–style labels).
 * Derived from canonical {@link deriveOrderStage} only.
 */
import {
  customerStageSubtitle,
  customerStageTitle,
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

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

function mapStageToCustomerPhase(stage: DerivedOrderStage): CustomerDeliveryPhase {
  switch (stage) {
    case 'awaiting_payment':
      return 'awaiting_payment';
    case 'awaiting_restaurant':
      return 'payment_confirmed';
    case 'preparing':
      return 'payment_confirmed';
    case 'driver_assignment':
      return 'finding_driver';
    case 'driver_assigned':
      return 'driver_assigned';
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

function progressFor(phase: CustomerDeliveryPhase): number {
  if (phase === 'cancelled') return 0;
  const i = PHASE_ORDER.indexOf(phase);
  if (i < 0) return 0.08;
  return Math.min(1, (i + 1) / PHASE_ORDER.length);
}

export function resolveCustomerDeliveryPhase(input: OrderStageInput): CustomerPhaseInfo {
  const stage = deriveOrderStage(input);
  const phase = mapStageToCustomerPhase(stage);
  return {
    phase,
    title: customerStageTitle(stage),
    subtitle: customerStageSubtitle(stage),
    progress: progressFor(phase),
  };
}
