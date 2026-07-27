/**
 * Food-share fulfillment mode helpers.
 * Delivery remains the default when the field is missing — never infer pickup from pricing alone.
 */

export type FoodShareFulfillmentMode = 'delivery' | 'pickup';

export function resolveFoodShareFulfillmentMode(
  raw: Record<string, unknown> | null | undefined,
): FoodShareFulfillmentMode {
  if (!raw) return 'delivery';
  const mode = raw.fulfillmentMode;
  if (mode === 'pickup' || mode === 'delivery') return mode;
  if (raw.pickupOnly === true || raw.pickupOnly === 'true') return 'pickup';
  if (raw.deliveryEnabled === false || raw.deliveryEnabled === 'false') {
    return 'pickup';
  }
  return 'delivery';
}

export function isPickupFulfillmentMode(
  raw: Record<string, unknown> | null | undefined,
): boolean {
  return resolveFoodShareFulfillmentMode(raw) === 'pickup';
}

export function isPickupFulfillment(
  mode: FoodShareFulfillmentMode | null | undefined,
): boolean {
  return mode === 'pickup';
}
