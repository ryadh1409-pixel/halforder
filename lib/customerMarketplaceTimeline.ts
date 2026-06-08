import { customerTrackStepFlags } from '@/lib/customerOrderPipelineLog';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  DELIVERY_STAGES,
  customerTrackStepIndex,
  resolveCustomerTrackStep,
  type CustomerTrackStep,
} from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';

export type CustomerMarketplaceTimelineStep = {
  key: CustomerTrackStep;
  label: string;
};

export type CustomerTimelineRenderStep = {
  id: CustomerTrackStep;
  label: string;
  completed: boolean;
  current: boolean;
};

/** Uber Eats–style fulfillment steps for marketplace delivery orders. */
export const CUSTOMER_MARKETPLACE_TIMELINE: CustomerMarketplaceTimelineStep[] =
  DELIVERY_STAGES.map((step) => ({
    key: step.key,
    label: step.label,
  }));

/** Index of the active timeline step (0-based), or -1 when cancelled. */
export function customerMarketplaceTimelineIndex(order: OrderStageInput): number {
  if (isOrderCompleted(order)) {
    return DELIVERY_STAGES.length - 1;
  }
  const step = resolveCustomerTrackStep(order);
  return customerTrackStepIndex(step);
}

/**
 * Render-ready timeline rows — uses the same `stepFlags` source as pipeline logs.
 * Completed/delivered orders: every stage is `completed`, none is `current`.
 */
export function buildCustomerTimelineRenderSteps(
  order: OrderStageInput,
): CustomerTimelineRenderStep[] {
  const currentStep = resolveCustomerTrackStep(order);
  const terminal = isOrderCompleted(order);
  const flags = customerTrackStepFlags(currentStep, order);

  return CUSTOMER_MARKETPLACE_TIMELINE.map((step) => ({
    id: step.key,
    label: step.label,
    completed: flags[step.key] === true,
    current: !terminal && currentStep === step.key,
  }));
}
