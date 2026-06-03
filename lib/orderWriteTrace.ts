import type { OrderStageInput } from '@/services/orderStage';
import { deriveOrderStage } from '@/services/orderStage';

export type OrderWriteTracePayload = {
  orderId: string;
  status?: unknown;
  deliveryStatus?: unknown;
  paymentStatus?: unknown;
  op?: 'update' | 'set' | 'add' | 'transaction-update' | 'transaction-set' | 'batch-update';
  merge?: boolean;
  hasPendingWrites?: boolean;
};

export type OrderLifecycleWriteTrace = {
  source: string;
  orderId: string;
  beforeStatus: unknown;
  incomingPatch: Record<string, unknown>;
  afterStatus: unknown;
  beforeStage?: string;
  afterStage?: string;
  hasPendingWrites?: boolean;
};

function lifecycleFieldsFromPatch(
  patch: Record<string, unknown>,
): Pick<OrderWriteTracePayload, 'status' | 'deliveryStatus' | 'paymentStatus'> {
  return {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.deliveryStatus !== undefined ? { deliveryStatus: patch.deliveryStatus } : {}),
    ...(patch.paymentStatus !== undefined ? { paymentStatus: patch.paymentStatus } : {}),
  };
}

/** Mandatory format for every marketplace order mutation. */
export function traceOrderLifecycleWrite(input: OrderLifecycleWriteTrace): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  console.log('[ORDER WRITE TRACE]', {
    source: input.source,
    orderId: input.orderId,
    beforeStatus: input.beforeStatus ?? null,
    incomingPatch: input.incomingPatch,
    afterStatus: input.afterStatus ?? null,
    beforeStage: input.beforeStage ?? null,
    afterStage: input.afterStage ?? null,
    hasPendingWrites: input.hasPendingWrites ?? false,
    timestamp: Date.now(),
  });
}

export function traceOrderWrite(
  fileName: string,
  functionName: string,
  payload: OrderWriteTracePayload,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;

  const hasLifecycle =
    payload.status !== undefined ||
    payload.deliveryStatus !== undefined ||
    payload.paymentStatus !== undefined;

  if (!hasLifecycle && !payload.op) return;

  traceOrderLifecycleWrite({
    source: `${fileName}#${functionName}`,
    orderId: payload.orderId,
    beforeStatus: null,
    incomingPatch: {
      status: payload.status ?? undefined,
      deliveryStatus: payload.deliveryStatus ?? undefined,
      paymentStatus: payload.paymentStatus ?? undefined,
      op: payload.op ?? 'update',
      merge: payload.merge ?? undefined,
    },
    afterStatus: null,
    hasPendingWrites: payload.hasPendingWrites ?? false,
  });
}

export function traceOrderWriteFromPatch(
  fileName: string,
  functionName: string,
  orderId: string,
  patch: Record<string, unknown>,
  extra?: Omit<OrderWriteTracePayload, 'orderId' | 'status' | 'deliveryStatus' | 'paymentStatus'>,
  current?: OrderStageInput | null,
): void {
  const currentInput = current ? { id: orderId, ...current } : { id: orderId };
  const merged = { ...currentInput, ...lifecycleFieldsFromPatch(patch) };

  traceOrderLifecycleWrite({
    source: `${fileName}#${functionName}`,
    orderId,
    beforeStatus: current?.status ?? null,
    incomingPatch: patch,
    afterStatus: patch.status ?? current?.status ?? null,
    beforeStage: deriveOrderStage(currentInput),
    afterStage: deriveOrderStage(merged),
    hasPendingWrites: extra?.hasPendingWrites ?? false,
  });
}
