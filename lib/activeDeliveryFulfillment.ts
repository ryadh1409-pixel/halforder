import type { ActiveDelivery } from '@/services/delivery';
import type { DriverMarketplaceFulfillmentView } from '@/lib/driverMarketplaceFulfillment';

/** Map live `subscribeActiveDelivery` row → workflow view (marketplace courier only). */
export function activeDeliveryToFulfillmentView(
  order: ActiveDelivery,
  orderId: string,
): DriverMarketplaceFulfillmentView {
  return {
    id: orderId,
    driverId: order.driverId ?? order.assignedDriverId,
    assignedDriverId: order.assignedDriverId ?? order.driverId,
    deliveryStatus: order.marketplaceCourierStatus,
    status: order.status,
  };
}
