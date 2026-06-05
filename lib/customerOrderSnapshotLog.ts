import { safeToMillis } from '@/utils/safeToMillis';

/** Dev + prod log for customer order listeners — always raw Firestore fields. */
export function logCustomerOrderSnapshot(
  orderId: string,
  data: Record<string, unknown>,
): void {
  const updatedAtMs = safeToMillis(data.updatedAt) ?? data.updatedAtMs ?? null;
  console.log('CUSTOMER SNAPSHOT', {
    orderId,
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    updatedAt: updatedAtMs,
  });
}
