import { serverTimestamp } from 'firebase/firestore';

import type { RestaurantOrder } from '@/services/orderService';
import { rawUpdateOrder } from '@/services/orderFirestoreWrite';

const DELIVERED_ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;
const REJECTED_HIDE_MS = 2 * 24 * 60 * 60 * 1000;

export type RestaurantOrderVisibilityPatch = {
  hiddenForRestaurant?: boolean;
  archivedByRestaurant?: boolean;
  archivedAt?: ReturnType<typeof serverTimestamp> | null;
  hiddenAt?: ReturnType<typeof serverTimestamp> | null;
  restoredAt?: ReturnType<typeof serverTimestamp> | null;
};

export function shouldAutoArchiveOrder(
  order: RestaurantOrder,
  now = Date.now(),
): 'archive' | 'hide' | null {
  if (order.archivedByRestaurant || order.hiddenForRestaurant) return null;

  if (order.status === 'delivered') {
    const anchor = order.deliveredAtMs ?? order.createdAtMs;
    if (anchor != null && now - anchor >= DELIVERED_ARCHIVE_MS) {
      return 'archive';
    }
  }

  if (order.status === 'rejected' || order.status === 'cancelled') {
    const anchor =
      order.status === 'cancelled'
        ? order.cancelledAtMs ?? order.createdAtMs
        : order.createdAtMs;
    if (anchor != null && now - anchor >= REJECTED_HIDE_MS) {
      return 'hide';
    }
  }

  return null;
}

async function patchOrderVisibility(
  orderId: string,
  patch: RestaurantOrderVisibilityPatch,
): Promise<void> {
  await rawUpdateOrder(
    orderId,
    { ...patch, updatedAt: serverTimestamp() },
    { fileName: 'orderArchiveService.ts', functionName: 'patchOrderVisibility' },
  );
}

export async function archiveOrderForRestaurant(orderId: string): Promise<void> {
  const now = serverTimestamp();
  await patchOrderVisibility(orderId, {
    archivedByRestaurant: true,
    hiddenForRestaurant: true,
    archivedAt: now,
    hiddenAt: now,
  });
}

export async function hideOrderForRestaurant(orderId: string): Promise<void> {
  await patchOrderVisibility(orderId, {
    hiddenForRestaurant: true,
    hiddenAt: serverTimestamp(),
  });
}

export async function restoreOrderForRestaurant(orderId: string): Promise<void> {
  await patchOrderVisibility(orderId, {
    archivedByRestaurant: false,
    hiddenForRestaurant: false,
    archivedAt: null,
    hiddenAt: null,
    restoredAt: serverTimestamp(),
  });
}
