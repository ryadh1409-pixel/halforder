import { resolveFoodShareFulfillmentMode } from '@/lib/foodShareFulfillment';
import { buildFoodShareUserPricing } from '@/lib/foodShareUserPricing';
import { describe, expect, it } from '@jest/globals';

describe('foodShareFulfillment pickup pricing', () => {
  it('defaults missing mode to delivery', () => {
    expect(resolveFoodShareFulfillmentMode({})).toBe('delivery');
    expect(resolveFoodShareFulfillmentMode(null)).toBe('delivery');
  });

  it('resolves pickup from fulfillmentMode and pickupOnly', () => {
    expect(resolveFoodShareFulfillmentMode({ fulfillmentMode: 'pickup' })).toBe(
      'pickup',
    );
    expect(resolveFoodShareFulfillmentMode({ pickupOnly: true })).toBe('pickup');
  });

  it('zeros delivery for pickup without changing food/service split', () => {
    const delivery = buildFoodShareUserPricing({
      originalFoodPrice: 20,
      sharedFoodPrice: 10,
      userDeliveryShare: 3,
      originalServiceFee: 2,
      fulfillmentMode: 'delivery',
    });
    const pickup = buildFoodShareUserPricing({
      originalFoodPrice: 20,
      sharedFoodPrice: 10,
      userDeliveryShare: 3,
      originalServiceFee: 2,
      fulfillmentMode: 'pickup',
    });
    expect(delivery.sharedDeliveryFee).toBe(3);
    expect(pickup.sharedDeliveryFee).toBe(0);
    expect(pickup.sharedFoodPrice).toBe(10);
    expect(pickup.sharedServiceFee).toBe(1);
    expect(pickup.displaySubtotal).toBe(11);
  });
});
