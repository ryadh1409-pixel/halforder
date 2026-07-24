import {
  MARKETPLACE_DELIVERY_STATUS,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';

/** Which live-map leg to draw for marketplace delivery tracking. */
export type DeliveryMapLeg = 'to_restaurant' | 'to_customer';

const TO_CUSTOMER_STATUSES = new Set([
  'picked_up',
  'on_the_way',
  'en_route_to_customer',
  'arrived_customer',
  'near_customer',
  'delivered',
  'completed',
]);

/**
 * Stage 1 (pickup / en route to restaurant): driver → restaurant
 * Stage 2 (picked up / en route to customer): driver → customer
 */
export function deliveryMapLegFromStatuses(
  deliveryStatus: unknown,
  kitchenStatus?: unknown,
): DeliveryMapLeg {
  const ds = normalizeMarketplaceDeliveryStatus(deliveryStatus);
  if (
    ds === MARKETPLACE_DELIVERY_STATUS.PICKED_UP ||
    ds === MARKETPLACE_DELIVERY_STATUS.DELIVERED
  ) {
    return 'to_customer';
  }

  const rawDelivery =
    typeof deliveryStatus === 'string' ? deliveryStatus.trim().toLowerCase() : '';
  const kitchen =
    typeof kitchenStatus === 'string' ? kitchenStatus.trim().toLowerCase() : '';

  if (TO_CUSTOMER_STATUSES.has(rawDelivery) || TO_CUSTOMER_STATUSES.has(kitchen)) {
    return 'to_customer';
  }

  return 'to_restaurant';
}
