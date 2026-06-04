import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { isEffectivelyDelivered } from '@/lib/driverCourierSnapshotMerge';
import {
  markDriverHubOrderCompleted,
  type DriverHubOrderRemoveReason,
} from '@/lib/driverHubOrdersStore';
import type { ActiveDelivery } from '@/services/delivery';
import type { DriverOrder } from '@/services/driverService';
import { showSuccess } from '@/utils/toast';
import { router } from 'expo-router';

export const DRIVER_DELIVERY_COMPLETE_TOAST = 'Delivery completed successfully';

export function isActiveDeliveryComplete(
  order: Pick<
    ActiveDelivery,
    | 'marketplaceCourierStatus'
    | 'firestoreDeliveryStatus'
    | 'status'
    | 'deliveredAtMs'
  > | null | undefined,
): boolean {
  if (!order) return false;
  return isEffectivelyDelivered(order);
}

/** UberEats-style exit: toast once, replace to Driver Hub (unsubscribes active listeners). */
export function exitDriverActiveDeliveryAfterComplete(
  handledRef: { current: boolean },
  orderId?: string | null,
  options?: {
    toast?: boolean;
    reason?: DriverHubOrderRemoveReason;
    driverOrder?: DriverOrder | null;
    activeDelivery?: ActiveDelivery | null;
  },
): void {
  if (handledRef.current) return;
  handledRef.current = true;
  const id = orderId?.trim() ?? '';
  if (id) {
    markDriverHubOrderCompleted(id, options?.reason ?? 'active_screen_exit', {
      driverOrder: options?.driverOrder,
      activeDelivery: options?.activeDelivery,
    });
  }
  if (options?.toast !== false) {
    showSuccess(DRIVER_DELIVERY_COMPLETE_TOAST);
  }
  router.replace(DRIVER_ROUTES.hub as never);
}
