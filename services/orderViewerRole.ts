import type { RestaurantOrder } from '@/services/orderService';
import type { UserRole } from '@/services/userService';

/** Who is viewing `/order/[id]` for marketplace delivery orders. */
export type MarketplaceOrderViewerRole = 'customer' | 'driver' | 'restaurant' | 'admin';

function primaryCustomerUid(order: RestaurantOrder): string {
  const fromCustomer = order.customer?.id?.trim?.();
  if (fromCustomer) return fromCustomer;
  const uid = order.userId?.trim?.();
  if (uid) return uid;
  return '';
}

/** Customer-side access: primary purchaser or legacy participant membership is handled by Firestore rules; UI defaults to customer if not restaurant/driver. */
export function resolveMarketplaceOrderViewerRole(
  order: RestaurantOrder,
  uid: string | undefined,
  firestoreRole: UserRole | null,
): MarketplaceOrderViewerRole {
  if (!uid) return 'customer';
  if (firestoreRole === 'admin') return 'admin';
  if (order.restaurantId === uid) return 'restaurant';
  if (firestoreRole === 'driver') return 'driver';
  const primary = primaryCustomerUid(order);
  if (primary && primary === uid) return 'customer';
  return 'customer';
}
