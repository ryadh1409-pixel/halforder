export const HALF_ORDER_PAIR_JOIN_PUSH_TYPE = 'half_order_pair_join' as const;

export type NearbyMatchPayload = {
  type: 'nearby_match';
  notificationId?: string;
};

export type HalfOrderPairJoinPayload = {
  type: typeof HALF_ORDER_PAIR_JOIN_PUSH_TYPE;
  notificationId?: string;
  orderId?: string;
  joinerName?: string;
  distanceKm?: string;
};

export type ChatMessagePayload = {
  type: 'chat_message';
  notificationId?: string;
  chatId?: string;
};

export type OrderMessagePayload = {
  type: 'order_message';
  notificationId?: string;
  orderId?: string;
};

export type AppNotificationPayload =
  | NearbyMatchPayload
  | HalfOrderPairJoinPayload
  | ChatMessagePayload
  | OrderMessagePayload
  | Record<string, unknown>;
