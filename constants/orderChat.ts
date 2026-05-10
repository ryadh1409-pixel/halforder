/** Sub-threads inside `orders/{orderId}/messages` documents (`chatType` field). */
export const ORDER_CHAT_TYPE = {
  CUSTOMER_DRIVER: 'customer_driver',
  RESTAURANT_DRIVER: 'restaurant_driver',
  SUPPORT: 'support',
} as const;

export type OrderChatType = (typeof ORDER_CHAT_TYPE)[keyof typeof ORDER_CHAT_TYPE];
