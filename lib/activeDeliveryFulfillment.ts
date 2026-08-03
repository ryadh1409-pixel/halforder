import type { ActiveDelivery } from '@/services/delivery';
import type { DriverMarketplaceFulfillmentView } from '@/lib/driverMarketplaceFulfillment';

/** Map live `subscribeActiveDelivery` row → workflow view (raw deliveryStatus). */
export function activeDeliveryToFulfillmentView(
  order: ActiveDelivery,
  orderId: string,
): DriverMarketplaceFulfillmentView {
  return {
    id: orderId,
    driverId: order.driverId ?? order.assignedDriverId,
    assignedDriverId: order.assignedDriverId ?? order.driverId,
    // Prefer raw Firestore courier field — same source as Driver Hub.
    deliveryStatus:
      order.firestoreDeliveryStatus || order.marketplaceCourierStatus,
    status: order.status,
  };
}
