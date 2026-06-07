import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import {
  logCustomerStatusResolve,
  resolveCustomerDeliveryStage,
} from '@/lib/customerDeliveryStatus';
import { isOrderCompleted } from '@/lib/orderCompletion';
import { resolveOrderFreshnessMs, type OrderSnapshotMeta } from '@/lib/orderSnapshotFreshness';
import {
  customerTrackHeaderTitle,
  customerTrackProgress,
  customerTrackStepLabel,
  resolveCustomerTrackStep,
  type CustomerTrackPhase,
} from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';

export type CustomerTrackingSnapshotReason =
  | 'applied'
  | 'ignored_stale'
  | 'regression_blocked'
  | 'signature_dedup';

/** Raw Firestore snapshot received on customer tracking paths. */
export function logCustomerTrackingSnapshot(
  orderId: string,
  raw: Record<string, unknown>,
  meta: OrderSnapshotMeta & { source?: string; freshnessReason?: string; listenerInstanceId?: string },
  reason: CustomerTrackingSnapshotReason,
): void {
  console.log('[CUSTOMER TRACKING SNAPSHOT]', {
    orderId,
    reason,
    source: meta.source ?? null,
    listenerInstanceId: meta.listenerInstanceId ?? null,
    freshnessReason: meta.freshnessReason ?? null,
    status: raw.status ?? null,
    deliveryStatus: raw.deliveryStatus ?? null,
    updatedAt: resolveOrderFreshnessMs(raw) || null,
    courierRank: resolveCustomerCourierRank(raw),
    fromCache: meta.fromCache,
    hasPendingWrites: meta.hasPendingWrites,
    completed: isOrderCompleted(raw),
  });
}

/** Timeline derivation log — confirms stage mapping reaches the UI layer. */
export function logCustomerTimeline(
  orderId: string,
  order: OrderStageInput | null | undefined,
  source?: string,
): void {
  const derivedStage = resolveCustomerTrackStep(order);
  if (orderId) {
    logCustomerStatusResolve(
      orderId,
      order?.deliveryStatus ?? null,
      resolveCustomerDeliveryStage(order),
      { trackStep: derivedStage },
    );
  }
  console.log('[CUSTOMER TIMELINE]', {
    orderId,
    source: source ?? null,
    status: order?.status ?? null,
    deliveryStatus: order?.deliveryStatus ?? null,
    derivedStage,
    timelineStep: customerTrackStepLabel(derivedStage),
    courierRank: resolveCustomerCourierRank(order ?? {}),
  });
}

export type CustomerTrackingUiState = {
  delivered: boolean;
  currentStep: CustomerTrackPhase;
  displayStatus: string;
  title: string;
  progress: number;
};

/** Single customer tracking display model — completion fields always win. */
export function resolveCustomerTrackingUi(
  order: OrderStageInput | null | undefined,
): CustomerTrackingUiState {
  if (!order) {
    return {
      delivered: false,
      currentStep: 'order_placed',
      displayStatus: 'Order placed',
      title: 'Restaurant reviewing your order',
      progress: 0.08,
    };
  }

  if (isOrderCompleted(order)) {
    return {
      delivered: true,
      currentStep: 'delivered',
      displayStatus: 'Delivered',
      title: 'Delivered',
      progress: 1,
    };
  }

  const step = resolveCustomerTrackStep(order);
  return {
    delivered: false,
    currentStep: step,
    displayStatus: customerTrackStepLabel(step),
    title: customerTrackHeaderTitle(step),
    progress: customerTrackProgress(step),
  };
}

export function logCustomerTrackingUi(
  orderId: string,
  order: OrderStageInput | null | undefined,
  source?: string,
): void {
  const ui = resolveCustomerTrackingUi(order);
  console.log('[CUSTOMER TRACKING UI]', {
    orderId,
    source: source ?? null,
    status: order?.status ?? null,
    deliveryStatus: order?.deliveryStatus ?? null,
    currentStep: ui.currentStep,
    displayStatus: ui.displayStatus,
    delivered: ui.delivered,
    progress: ui.progress,
  });
  logCustomerTimeline(orderId, order, source);
}
