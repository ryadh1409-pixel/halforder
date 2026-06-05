import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import {
  customerTrackStepIndex,
  customerTrackStepLabel,
  DELIVERY_STAGES,
  resolveCustomerTrackStep,
  type CustomerTrackPhase,
} from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';

export type CustomerOrderPipelineSource =
  | 'track-order'
  | 'subscribeCustomerOrderById'
  | 'useMarketplaceOrderDetail'
  | 'stage-derivation';

export type CustomerOrderPipelineMeta = {
  fromCache?: boolean;
  hasPendingWrites?: boolean;
};

function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Per-step completion flags for comparing restaurant vs customer views. */
export function customerTrackStepFlags(step: CustomerTrackPhase): Record<string, boolean> {
  const activeIdx = customerTrackStepIndex(step);
  const flags: Record<string, boolean> = {};
  for (let i = 0; i < DELIVERY_STAGES.length; i += 1) {
    flags[DELIVERY_STAGES[i].key] = activeIdx >= 0 && i <= activeIdx;
  }
  return flags;
}

/**
 * Logs the full customer order data pipeline for debugging realtime desync.
 * Compare `rawStatus` / `rawDeliveryStatus` with `mappedStatus` / `mappedDeliveryStatus`
 * and `derivedCustomerStage` on restaurant + customer simulators for the same orderId.
 */
export function logCustomerOrderPipeline(
  source: CustomerOrderPipelineSource,
  orderId: string,
  raw: Record<string, unknown>,
  mapped?: OrderStageInput | null,
  meta?: CustomerOrderPipelineMeta,
): void {
  const rawStatus = raw.status ?? null;
  const rawDeliveryStatus = raw.deliveryStatus ?? null;
  const rawCourier = normalizeMarketplaceDeliveryStatus(rawDeliveryStatus);

  const mappedInput: OrderStageInput = mapped ?? {
    id: orderId,
    status: rawStatus,
    paymentStatus: raw.paymentStatus,
    deliveryStatus: rawDeliveryStatus,
    driverId: raw.driverId,
    assignedDriverId: raw.assignedDriverId,
    pickedUpAtMs:
      typeof raw.pickedUpAtMs === 'number' ? raw.pickedUpAtMs : undefined,
    deliveredAtMs:
      typeof raw.deliveredAtMs === 'number' ? raw.deliveredAtMs : undefined,
  };

  const derivedStage = resolveCustomerTrackStep(mappedInput);
  const stepFlags = customerTrackStepFlags(derivedStage);

  console.log('CUSTOMER_ORDER_PIPELINE', {
    source,
    orderId,
    meta: meta ?? null,
    raw: {
      status: rawStatus,
      deliveryStatus: rawDeliveryStatus,
      paymentStatus: raw.paymentStatus ?? null,
      updatedAt: raw.updatedAt ?? raw.updatedAtMs ?? null,
    },
    mapped: mapped
      ? {
          status: mapped.status ?? null,
          deliveryStatus: mapped.deliveryStatus ?? null,
          paymentStatus: mapped.paymentStatus ?? null,
        }
      : null,
    marketplaceCourierStatus: rawCourier,
    derivedCustomerStage: derivedStage,
    derivedCustomerStageLabel: customerTrackStepLabel(derivedStage),
    stepFlags,
  });
}
