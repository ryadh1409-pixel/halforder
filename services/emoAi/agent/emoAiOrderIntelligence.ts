/** Map live order fields into natural-language alerts for Tham. */

export type EmoAiOrderStageInput = {
  id: string;
  status?: string | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  restaurantName?: string | null;
  driverEtaMinutes?: number | null;
};

const STAGE_LABELS: Record<string, string> = {
  created: 'Order Created',
  waiting_for_members: 'Waiting For Members',
  members_joined: 'Members Joined',
  split_completed: 'Split Completed',
  payment_completed: 'Payment Completed',
  paid: 'Payment Completed',
  restaurant_accepted: 'Restaurant Accepted',
  preparing: 'Restaurant Preparing',
  driver_assigned: 'Driver Assigned',
  driver_arriving: 'Driver Arriving',
  heading_to_restaurant: 'Driver Assigned',
  arrived_restaurant: 'Driver Arriving',
  picked_up: 'Driver Picked Up',
  on_the_way: 'Driver Arriving',
  delivered: 'Delivered',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  refund_requested: 'Refund Requested',
  refund_completed: 'Refund Completed',
  refund_pending: 'Refund Pending',
  payment_failed: 'Payment Failed',
  failed: 'Payment Failed',
  driver_cancelled: 'Driver Cancelled',
  restaurant_cancelled: 'Restaurant Cancelled',
  delayed: 'Delivery Delayed',
};

export function describeOrderStage(order: EmoAiOrderStageInput): string {
  const status = String(order.status ?? '').toLowerCase();
  const pay = String(order.paymentStatus ?? '').toLowerCase();
  const del = String(order.deliveryStatus ?? '').toLowerCase();
  const key = del || status || pay;
  const label =
    STAGE_LABELS[key] ?? STAGE_LABELS[status] ?? (status || 'Updating');
  const rest = order.restaurantName ? ` at ${order.restaurantName}` : '';
  if (typeof order.driverEtaMinutes === 'number' && order.driverEtaMinutes >= 0) {
    return `🚗 Your driver is about ${order.driverEtaMinutes} minutes away${rest}. (${label})`;
  }
  if (key.includes('accept') || status === 'restaurant_accepted') {
    return `🍕 Your restaurant accepted your order${rest}.`;
  }
  if (key.includes('member') || status === 'waiting_for_members') {
    return `🎉 Waiting for members to join your split order${rest}.`;
  }
  if (key.includes('deliver') || status === 'completed') {
    return `✅ Order ${order.id.slice(0, 8)}… is delivered${rest}.`;
  }
  if (key.includes('cancel')) {
    return `⚠️ Order ${order.id.slice(0, 8)}… was cancelled${rest}.`;
  }
  if (pay === 'failed' || status === 'payment_failed') {
    return `💳 Payment failed for order ${order.id.slice(0, 8)}… — you can retry in Orders.`;
  }
  return `📦 Order ${order.id.slice(0, 8)}… — ${label}${rest}.`;
}

export function buildOrderAlerts(orders: EmoAiOrderStageInput[], limit = 5): string[] {
  return orders.slice(0, limit).map(describeOrderStage);
}

export function humanizeOrderPipelineStatus(raw: string): string {
  const key = raw.toLowerCase().trim();
  return STAGE_LABELS[key] ?? raw.replace(/_/g, ' ');
}
