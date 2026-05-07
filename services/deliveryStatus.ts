export type DeliveryStatus =
  | 'waiting_driver'
  | 'driver_assigned'
  | 'heading_to_restaurant'
  | 'arrived_restaurant'
  | 'picked_up'
  | 'on_the_way'
  | 'near_customer'
  | 'delivered'
  | 'cancelled';

export function normalizeDeliveryStatus(value: unknown): DeliveryStatus {
  const v = typeof value === 'string' ? value : '';
  if (
    v === 'waiting_driver' ||
    v === 'driver_assigned' ||
    v === 'heading_to_restaurant' ||
    v === 'arrived_restaurant' ||
    v === 'picked_up' ||
    v === 'on_the_way' ||
    v === 'near_customer' ||
    v === 'delivered' ||
    v === 'cancelled'
  ) {
    return v;
  }
  return 'waiting_driver';
}
