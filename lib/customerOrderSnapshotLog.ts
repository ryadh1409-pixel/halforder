import { logCustomerOrderPipeline } from '@/lib/customerOrderPipelineLog';
import { logOrderStatusTransition, orderDocumentPath } from '@/lib/orderTerminalStatus';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import { safeToMillis } from '@/utils/safeToMillis';

const lastCustomerSnapshotByOrderId = new Map<
  string,
  { status: unknown; deliveryStatus: unknown }
>();

export type CustomerSnapshotMeta = {
  fromCache?: boolean;
  hasPendingWrites?: boolean;
  source?: 'track-order' | 'subscribeCustomerOrderById' | 'useOrder';
};

/** Logs raw Firestore fields + mapped courier + derived customer stage. */
export function logCustomerOrderSnapshot(
  orderId: string,
  data: Record<string, unknown>,
  meta?: CustomerSnapshotMeta,
): void {
  const updatedAtMs = safeToMillis(data.updatedAt) ?? data.updatedAtMs ?? null;
  const courier = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  const previous = lastCustomerSnapshotByOrderId.get(orderId);
  const firestorePath = orderDocumentPath(orderId);

  if (
    previous &&
    (previous.status !== data.status || previous.deliveryStatus !== data.deliveryStatus)
  ) {
    logOrderStatusTransition(orderId, previous.status, data.status ?? null, {
      source: meta?.source ?? 'customer_snapshot',
      firestorePath,
      previousDeliveryStatus: previous.deliveryStatus,
      newDeliveryStatus: data.deliveryStatus ?? null,
    });
  }
  lastCustomerSnapshotByOrderId.set(orderId, {
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
  });

  const derivedStage = resolveCustomerTrackStep({
    id: orderId,
    status: data.status,
    paymentStatus: data.paymentStatus,
    deliveryStatus: data.deliveryStatus,
    driverId: data.driverId,
    assignedDriverId: data.assignedDriverId,
    pickedUpAtMs:
      typeof data.pickedUpAtMs === 'number' ? data.pickedUpAtMs : undefined,
    deliveredAtMs:
      typeof data.deliveredAtMs === 'number' ? data.deliveredAtMs : undefined,
  });

  console.log('CUSTOMER SNAPSHOT', {
    orderId,
    firestorePath,
    source: meta?.source ?? null,
    fromCache: meta?.fromCache ?? null,
    hasPendingWrites: meta?.hasPendingWrites ?? null,
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    marketplaceCourierStatus: courier,
    derivedCustomerStage: derivedStage,
    updatedAt: updatedAtMs,
  });

  logCustomerOrderPipeline(
    meta?.source === 'track-order' ? 'track-order' : 'subscribeCustomerOrderById',
    orderId,
    data,
    null,
    {
      fromCache: meta?.fromCache,
      hasPendingWrites: meta?.hasPendingWrites,
    },
  );
}
