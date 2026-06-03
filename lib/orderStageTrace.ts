import { ENABLE_ORDER_TRACE } from '@/lib/orderTraceFlags';
import {
  deriveOrderStage,
  type DerivedOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';

export type OrderStageTraceMeta = {
  hasPendingWrites?: boolean;
  sourceScreen?: string;
};

export function traceOrderStageRender(
  order: OrderStageInput | null | undefined,
  meta?: OrderStageTraceMeta,
): DerivedOrderStage {
  const derivedStage = deriveOrderStage(order);
  if (!ENABLE_ORDER_TRACE) return derivedStage;

  const row = order as Record<string, unknown> | null | undefined;
  console.log('[ORDER STAGE TRACE]', {
    orderId: order?.id ?? null,
    status: order?.status ?? null,
    deliveryStatus: order?.deliveryStatus ?? null,
    derivedStage,
    updatedBy: typeof row?.updatedBy === 'string' ? row.updatedBy : null,
    hasPendingWrites: meta?.hasPendingWrites ?? false,
    sourceScreen: meta?.sourceScreen ?? null,
    timestamp: Date.now(),
  });

  return derivedStage;
}
