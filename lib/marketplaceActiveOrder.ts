import { MARKETPLACE_CLIENT_EXPIRY_DISABLED } from '@/lib/marketplaceClientFilters';
import {
  isDriverMarketplaceVisible,
  isMarketplaceReadyCourierStatus,
  isPaidMarketplaceDeliveryOrder,
  normalizeMarketplaceDeliveryStatus,
} from '@/lib/orderStatus';
import { isMarketplaceOrderExpiredByAge, resolveMarketplaceCreatedAtMs } from '@/lib/orderExpiry';
import { marketplaceLog } from '@/lib/marketplaceLogger';

export type MarketplaceOrderFields = {
  createdAt?: unknown;
  paidAt?: unknown;
  updatedAt?: unknown;
  readyAt?: unknown;
  acceptedAt?: unknown;
  preparedAt?: unknown;
  expired?: unknown;
  marketplaceArchived?: unknown;
  archivedByRestaurant?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  paymentStatus?: unknown;
  deliveryType?: unknown;
};

/** Client-side guard: active driver marketplace row. */
export function isActiveDriverMarketplaceOrder(
  data: MarketplaceOrderFields,
  orderId?: string,
): boolean {
  if (MARKETPLACE_CLIENT_EXPIRY_DISABLED) return true;
  if (!isPaidMarketplaceDeliveryOrder(data)) {
    return false;
  }
  if (data.expired === true || data.marketplaceArchived === true) {
    if (orderId) {
      marketplaceLog.queryFilter(orderId, { reason: 'expired_flag' });
    }
    return false;
  }
  if (data.archivedByRestaurant === true) {
    if (orderId) marketplaceLog.queryFilter(orderId, { reason: 'archived_by_restaurant' });
    return false;
  }
  if (typeof data.driverId === 'string' && data.driverId.length > 0) {
    return false;
  }
  if (typeof data.assignedDriverId === 'string' && data.assignedDriverId.length > 0) {
    return false;
  }
  const readyCourier = isMarketplaceReadyCourierStatus(data.deliveryStatus);
  if (!readyCourier && isMarketplaceOrderExpiredByAge(data, Date.now(), orderId)) {
    if (orderId) marketplaceLog.expired(orderId, { source: 'createdAt' });
    return false;
  }
  const ds = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  if (!isDriverMarketplaceVisible(ds)) {
    if (orderId) {
      marketplaceLog.queryFilter(orderId, { reason: 'delivery_status', deliveryStatus: ds });
    }
    return false;
  }
  return true;
}

export function isMarketplaceOrderExpired(data: MarketplaceOrderFields): boolean {
  if (MARKETPLACE_CLIENT_EXPIRY_DISABLED) return false;
  return (
    data.expired === true
    || data.marketplaceArchived === true
    || isMarketplaceOrderExpiredByAge(data)
  );
}

export function resolvePoolCreatedAtMs(data: MarketplaceOrderFields): number | null {
  return resolveMarketplaceCreatedAtMs(data);
}
