import type { Href } from 'expo-router';
import type { FoodShareNotificationType } from '@/lib/foodShareUx';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';

/**
 * Smart notification routing for food share + marketplace lifecycle events.
 */
export function resolveFoodShareNotificationRoute(input: {
  type: FoodShareNotificationType | string;
  deepLink?: string | null;
  matchId?: string | null;
  adminFoodShareId?: string | null;
  orderId?: string | null;
}): string {
  const type = String(input.type ?? '').toLowerCase();
  const matchId = input.matchId?.trim() || null;
  const adminFoodShareId = input.adminFoodShareId?.trim() || null;
  const orderId = input.orderId?.trim() || null;

  if (type.startsWith('admin_')) {
    if (input.deepLink?.trim()) return input.deepLink.trim();
    return '/inbox';
  }

  switch (type) {
    case 'share_joined':
      if (adminFoodShareId) return USER_ROUTES.foodShareWaiting(adminFoodShareId);
      break;
    case 'pairing_awaiting_payment':
    case 'match_created':
    case 'payment_failed':
      if (matchId) return USER_ROUTES.foodSharePay(matchId);
      break;
    case 'payment_success':
    case 'partner_paid':
    case 'match_activated':
    case 'chat_message':
    case 'chat_message_blocked':
    case 'chat_warning':
      if (matchId) return USER_ROUTES.foodShareChat(matchId);
      break;
    case 'driver_assigned':
    case 'driver_arrived':
    case 'picked_up':
    case 'delivered':
    case 'order_placed':
    case 'order_completed':
      if (orderId) return `/track-order/${encodeURIComponent(orderId)}`;
      if (matchId) return USER_ROUTES.foodShareHubMatch(matchId);
      break;
    case 'match_cancelled':
      if (adminFoodShareId) return USER_ROUTES.foodShare(adminFoodShareId);
      if (matchId) return USER_ROUTES.foodShareHubMatch(matchId);
      break;
    default:
      break;
  }

  if (input.deepLink?.trim()) return input.deepLink.trim();
  if (matchId) return USER_ROUTES.foodShareHubMatch(matchId);
  if (adminFoodShareId) return USER_ROUTES.foodShare(adminFoodShareId);
  return String(USER_ROUTES.ordersHub);
}

export function resolveMarketplaceOrderRoute(orderId: string): Href {
  return customerOrderDetailHref(orderId);
}
