/** `data.type` on Expo pushes for HalfOrder second-member join (handlers + sender). */
export const HALF_ORDER_PAIR_JOIN_PUSH_TYPE = 'half_order_pair_join' as const;

/** Restaurant kitchen: brand-new paid order assigned to the venue. */
export const RESTAURANT_NEW_ORDER_PUSH_TYPE = 'restaurant_new_order' as const;

/** Admin: new paid customer order. */
export const ADMIN_NEW_ORDER_PUSH_TYPE = 'admin_new_order_created' as const;

/** Driver: restaurant marked order ready for pickup. */
export const DRIVER_READY_FOR_PICKUP_PUSH_TYPE = 'driver_ready_for_pickup' as const;

export { GROWTH_NEARBY_FOOD_PUSH_TYPE } from './growth';
