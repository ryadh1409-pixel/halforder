/** Expo push `data.type` values for admin food-share matching. */
export const FOOD_SHARE_PUSH = {
  SHARE_JOINED: 'food_share_joined',
  PAIRING_AWAITING_PAYMENT: 'food_share_pairing_awaiting_payment',
  PAYMENT_SUCCESS: 'food_share_payment_success',
  PAYMENT_FAILED: 'food_share_payment_failed',
  PARTNER_PAID: 'food_share_partner_paid',
  REFUND_PROCESSED: 'food_share_refund_processed',
  MATCH_ACTIVATED: 'food_share_match_activated',
  MATCH_CREATED: 'food_share_match_created',
  CHAT_MESSAGE: 'food_share_chat_message',
  ORDER_PLACED: 'food_share_order_placed',
  DRIVER_ASSIGNED: 'food_share_driver_assigned',
  DRIVER_ARRIVED: 'food_share_driver_arrived',
  PICKED_UP: 'food_share_picked_up',
  DELIVERED: 'food_share_delivered',
  MATCH_CANCELLED: 'food_share_match_cancelled',
  REPORT_SUBMITTED: 'food_share_report_submitted',
} as const;

export type FoodSharePushType =
  (typeof FOOD_SHARE_PUSH)[keyof typeof FOOD_SHARE_PUSH];
