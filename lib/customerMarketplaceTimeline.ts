import {
  deriveOrderStage,
  restaurantKitchenSubstage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

export type CustomerMarketplaceTimelineStep = {
  key: string;
  label: string;
  derivedStage: DerivedOrderStage;
  kitchenSubstage?: 'accepted' | 'preparing';
};

/** Uber Eats–style fulfillment steps for marketplace delivery orders. */
export const CUSTOMER_MARKETPLACE_TIMELINE: CustomerMarketplaceTimelineStep[] = [
  { key: 'placed', label: 'Order placed', derivedStage: 'awaiting_restaurant' },
  {
    key: 'accepted',
    label: 'Restaurant accepted',
    derivedStage: 'preparing',
    kitchenSubstage: 'accepted',
  },
  {
    key: 'preparing',
    label: 'Preparing',
    derivedStage: 'preparing',
    kitchenSubstage: 'preparing',
  },
  { key: 'ready', label: 'Ready for pickup', derivedStage: 'driver_assignment' },
  { key: 'driver', label: 'Driver assigned', derivedStage: 'driver_assigned' },
  { key: 'picked_up', label: 'Picked up', derivedStage: 'picked_up' },
  { key: 'delivered', label: 'Delivered', derivedStage: 'delivered' },
];

const STAGE_RANK: Record<DerivedOrderStage, number> = {
  awaiting_payment: 0,
  awaiting_restaurant: 1,
  preparing: 2,
  driver_assignment: 3,
  driver_assigned: 4,
  picked_up: 5,
  delivered: 6,
  cancelled: -1,
};

function stepRank(step: CustomerMarketplaceTimelineStep): number {
  let rank = STAGE_RANK[step.derivedStage] ?? 0;
  if (step.derivedStage === 'preparing' && step.kitchenSubstage === 'preparing') {
    rank += 0.5;
  }
  return rank;
}

function orderProgressRank(order: OrderStageInput): number {
  const stage = deriveOrderStage(order);
  if (stage === 'cancelled') return -1;
  if (stage === 'delivered') return STAGE_RANK.delivered;
  if (stage === 'picked_up') return STAGE_RANK.picked_up;
  if (stage === 'driver_assigned') return STAGE_RANK.driver_assigned;
  if (stage === 'driver_assignment') return STAGE_RANK.driver_assignment;
  if (stage === 'preparing') {
    const sub = restaurantKitchenSubstage(order);
    return sub === 'preparing' ? STAGE_RANK.preparing + 0.5 : STAGE_RANK.preparing;
  }
  if (stage === 'awaiting_restaurant') return STAGE_RANK.awaiting_restaurant;
  return STAGE_RANK.awaiting_payment;
}

/** Index of the active timeline step (0-based), or -1 when cancelled. */
export function customerMarketplaceTimelineIndex(order: OrderStageInput): number {
  if (deriveOrderStage(order) === 'cancelled') return -1;
  const progress = orderProgressRank(order);
  let best = 0;
  for (let i = 0; i < CUSTOMER_MARKETPLACE_TIMELINE.length; i += 1) {
    if (stepRank(CUSTOMER_MARKETPLACE_TIMELINE[i]) <= progress) {
      best = i;
    }
  }
  return best;
}
