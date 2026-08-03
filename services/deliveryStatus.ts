/** @deprecated Prefer `@/lib/orderStatus` + `@/lib/canonicalDeliveryStage`. */
export {
  DELIVERY_STATUS,
  MARKETPLACE_DELIVERY_STATUS,
  type DeliveryStatus,
  type MarketplaceDeliveryStatus,
  normalizeDeliveryStatus,
  normalizeMarketplaceDeliveryStatus,
  isDriverMarketplaceVisible,
  isDriverMarketplaceClaimable,
  isDriverMarketplaceRemoved,
  isPaidMarketplaceDeliveryOrder,
} from '@/lib/orderStatus';

export { marketplaceDeliveryStatusLabel } from '@/lib/canonicalDeliveryStage';
