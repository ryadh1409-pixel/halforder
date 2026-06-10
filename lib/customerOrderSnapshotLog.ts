import { logCustomerOrderPipeline } from '@/lib/customerOrderPipelineLog';
import {
  logServerOrCacheOrder,
  resolveOrderFreshnessMs,
  type OrderSnapshotMeta,
} from '@/lib/orderSnapshotFreshness';
import { logOrderStatusTransition, orderDocumentPath } from '@/lib/orderTerminalStatus';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import { safeToMillis } from '@/utils/safeToMillis';

const lastCustomerSnapshotByOrderId = new Map<
  string,
  { status: unknown; deliveryStatus: unknown }
>();

export type CustomerSnapshotMeta = OrderSnapshotMeta & {
  source?: 'track-order' | 'subscribeCustomerOrderById' | 'useOrder';
  listenerInstanceId?: string;
  freshnessReason?: string;
};

export type CustomerRawDocStage =
  | 'listener'
  | 'mapper'
  | 'useProfileOrders'
  | 'track-order-render';

/** Trace deliveryStatus across listener → mapper → UI (debug stale snapshot regressions). */
export function logCustomerRawDoc(
  orderId: string,
  data: Record<string, unknown>,
  stage: CustomerRawDocStage,
): void {
  console.log('[CUSTOMER RAW DOC]', {
    stage,
    orderId,
    deliveryStatus: data.deliveryStatus ?? null,
    status: data.status ?? null,
    updatedAt: data.updatedAt ?? null,
    updatedAtMs: data.updatedAtMs ?? null,
  });
}

/** Raw Firestore document as seen by customer listeners — before any UI mapping. */
export function logRawFirestoreCustomerDoc(
  orderId: string,
  raw: Record<string, unknown>,
  meta: CustomerSnapshotMeta,
): void {
  console.log('[RAW FIRESTORE CUSTOMER DOC]', {
    orderId,
    deliveryStatus: raw.deliveryStatus ?? null,
    status: raw.status ?? null,
    updatedAt: resolveOrderFreshnessMs(raw) || null,
    fromCache: meta.fromCache ?? null,
    hasPendingWrites: meta.hasPendingWrites ?? null,
    source: meta.source ?? null,
    listenerInstanceId: meta.listenerInstanceId ?? null,
    freshnessReason: meta.freshnessReason ?? null,
    timestamp: Date.now(),
  });
}

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

  logServerOrCacheOrder(orderId, data, {
    fromCache: meta?.fromCache ?? false,
    hasPendingWrites: meta?.hasPendingWrites ?? false,
  }, meta?.source ?? 'customer_snapshot');

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
