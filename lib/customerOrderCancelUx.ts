import { deriveOrderStage, type OrderStageInput } from '@/services/orderStage';
import { extractErrorCode } from '@/utils/errorMessages';

/** Customer may cancel only before the restaurant accepts (canonical stages). */
export function canCustomerCancelMarketplaceOrder(
  order: OrderStageInput | null | undefined,
): boolean {
  const stage = deriveOrderStage(order);
  return stage === 'awaiting_payment' || stage === 'awaiting_restaurant';
}

/** True when kitchen has accepted or the order has moved past customer-cancel window. */
export function isOrderPastCustomerCancelStage(
  order: OrderStageInput | null | undefined,
): boolean {
  return !canCustomerCancelMarketplaceOrder(order);
}

export function isFirestorePermissionDenied(error: unknown): boolean {
  const code = extractErrorCode(error);
  return code === 'permission-denied' || code === 'missing-or-insufficient-permissions';
}

export type CustomerCancelErrorAction = 'restaurant_accepted' | null;

/**
 * Maps Firestore permission-denied after acceptance to a UI action;
 * returns null when the caller should show a generic error.
 */
export function resolveCustomerCancelOrderError(
  error: unknown,
  order: OrderStageInput,
): CustomerCancelErrorAction {
  if (isFirestorePermissionDenied(error) && isOrderPastCustomerCancelStage(order)) {
    return 'restaurant_accepted';
  }
  return null;
}
