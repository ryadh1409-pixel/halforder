/**
 * TEMP: trace every Firestore write to `orders/{orderId}`.
 * Search logs for `[ORDER WRITE TRACE]` and filter by orderId.
 */

export type OrderWriteTracePayload = {
  orderId: string;
  status?: unknown;
  deliveryStatus?: unknown;
  paymentStatus?: unknown;
  op?: 'update' | 'set' | 'add' | 'transaction-update' | 'transaction-set' | 'batch-update';
  merge?: boolean;
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

/** Log when patch touches lifecycle fields or when explicitly tracing any order write. */
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

  console.log('[ORDER WRITE TRACE]', fileName, functionName, {
    orderId: payload.orderId,
    status: payload.status ?? null,
    deliveryStatus: payload.deliveryStatus ?? null,
    paymentStatus: payload.paymentStatus ?? null,
    op: payload.op ?? 'update',
    merge: payload.merge ?? null,
  });
}

export function traceOrderWriteFromPatch(
  fileName: string,
  functionName: string,
  orderId: string,
  patch: Record<string, unknown>,
  extra?: Omit<OrderWriteTracePayload, 'orderId' | 'status' | 'deliveryStatus' | 'paymentStatus'>,
): void {
  traceOrderWrite(fileName, functionName, {
    orderId,
    ...lifecycleFieldsFromPatch(patch),
    ...extra,
  });
}
