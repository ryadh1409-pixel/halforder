import type { OrderChatType } from '@/constants/orderChat';

/** Stable deep link into `/order/room/[id]` (works reliably across Expo Router versions). */
export function orderRoomHref(orderId: string, chatType: OrderChatType): string {
  const id = encodeURIComponent(orderId.trim());
  const ct = encodeURIComponent(chatType);
  return `/order/room/${id}?chatType=${ct}`;
}
