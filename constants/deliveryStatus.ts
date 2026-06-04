export const DELIVERY_STATUS = {
  AVAILABLE: 'available',
  ACCEPTED: 'accepted',
  ARRIVED_AT_RESTAURANT: 'arrived_at_restaurant',
  PICKED_UP: 'picked_up',
  ON_THE_WAY: 'on_the_way',
  ARRIVED_CUSTOMER: 'arrived_customer',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export type DeliveryLifecycleStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export const ACTIVE_DELIVERY_STATUSES: DeliveryLifecycleStatus[] = [
  DELIVERY_STATUS.ACCEPTED,
  DELIVERY_STATUS.ARRIVED_AT_RESTAURANT,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.ON_THE_WAY,
  DELIVERY_STATUS.ARRIVED_CUSTOMER,
];

export const NEXT_DELIVERY_STATUS: Record<
  DeliveryLifecycleStatus,
  DeliveryLifecycleStatus | null
> = {
  [DELIVERY_STATUS.AVAILABLE]: DELIVERY_STATUS.ACCEPTED,
  [DELIVERY_STATUS.ACCEPTED]: DELIVERY_STATUS.ARRIVED_AT_RESTAURANT,
  [DELIVERY_STATUS.ARRIVED_AT_RESTAURANT]: DELIVERY_STATUS.PICKED_UP,
  [DELIVERY_STATUS.PICKED_UP]: DELIVERY_STATUS.ON_THE_WAY,
  [DELIVERY_STATUS.ON_THE_WAY]: DELIVERY_STATUS.ARRIVED_CUSTOMER,
  [DELIVERY_STATUS.ARRIVED_CUSTOMER]: DELIVERY_STATUS.DELIVERED,
  [DELIVERY_STATUS.DELIVERED]: null,
  [DELIVERY_STATUS.CANCELLED]: null,
};

export const DELIVERY_STATUS_LABEL: Record<DeliveryLifecycleStatus, string> = {
  [DELIVERY_STATUS.AVAILABLE]: 'Available',
  [DELIVERY_STATUS.ACCEPTED]: 'Accepted',
  [DELIVERY_STATUS.ARRIVED_AT_RESTAURANT]: 'Arrived at restaurant',
  [DELIVERY_STATUS.PICKED_UP]: 'Picked up',
  [DELIVERY_STATUS.ON_THE_WAY]: 'On the way',
  [DELIVERY_STATUS.ARRIVED_CUSTOMER]: 'Arrived at customer',
  [DELIVERY_STATUS.DELIVERED]: 'Delivered',
  [DELIVERY_STATUS.CANCELLED]: 'Cancelled',
};

const LEGACY_TO_LIFECYCLE: Record<string, DeliveryLifecycleStatus> = {
  waiting_driver: DELIVERY_STATUS.AVAILABLE,
  driver_assigned: DELIVERY_STATUS.ACCEPTED,
  ready_for_pickup: DELIVERY_STATUS.ARRIVED_AT_RESTAURANT,
  heading_to_restaurant: DELIVERY_STATUS.ACCEPTED,
  arrived_restaurant: DELIVERY_STATUS.ARRIVED_AT_RESTAURANT,
  near_customer: DELIVERY_STATUS.ARRIVED_CUSTOMER,
};

export function normalizeDeliveryLifecycleStatus(value: unknown): DeliveryLifecycleStatus {
  if (typeof value !== 'string') return DELIVERY_STATUS.AVAILABLE;
  const v = value.toLowerCase();
  if (Object.values(DELIVERY_STATUS).includes(v as DeliveryLifecycleStatus)) {
    return v as DeliveryLifecycleStatus;
  }
  return LEGACY_TO_LIFECYCLE[v] ?? DELIVERY_STATUS.AVAILABLE;
}
