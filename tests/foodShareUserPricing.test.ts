import {
  buildFoodShareUserPricing,
  pricingFromShareDoc,
} from '@/lib/foodShareUserPricing';

describe('foodShareUserPricing', () => {
  it('splits delivery and service fees equally for a normal shared delivery order', () => {
    const p = buildFoodShareUserPricing({
      originalFoodPrice: 10,
      sharedFoodPrice: 5,
      userDeliveryShare: 2,
      originalServiceFee: 2,
    });
    expect(p.originalDeliveryFee).toBe(4);
    expect(p.sharedDeliveryFee).toBe(2);
    expect(p.originalServiceFee).toBe(2);
    expect(p.sharedServiceFee).toBe(1);
    expect(p.displaySubtotal).toBe(8);
    expect(p.foodSaving).toBe(5);
    expect(p.sharedDeliverySaving).toBe(2);
    expect(p.sharedServiceFeeSaving).toBe(1);
    expect(p.totalSaving).toBe(8);
  });

  it('waives delivery fee with free_delivery promo', () => {
    const p = buildFoodShareUserPricing({
      originalFoodPrice: 10,
      sharedFoodPrice: 5,
      userDeliveryShare: 2,
      originalServiceFee: 2,
      shareRaw: { promotionBadges: ['free_delivery'] },
    });
    expect(p.freeDelivery).toBe(true);
    expect(p.sharedDeliveryFee).toBe(0);
    expect(p.freeDeliverySaving).toBe(4);
    expect(p.sharedDeliverySaving).toBe(0);
    expect(p.displaySubtotal).toBe(6);
  });

  it('waives service fee with free_service_fee promo', () => {
    const p = buildFoodShareUserPricing({
      originalFoodPrice: 10,
      sharedFoodPrice: 5,
      userDeliveryShare: 2,
      originalServiceFee: 2,
      shareRaw: { promotionBadges: ['free_service_fee'] },
    });
    expect(p.freeServiceFee).toBe(true);
    expect(p.sharedServiceFee).toBe(0);
    expect(p.freeServiceFeeSaving).toBe(2);
    expect(p.displaySubtotal).toBe(7);
  });

  it('handles combined promos and discount', () => {
    const p = buildFoodShareUserPricing({
      originalFoodPrice: 10,
      sharedFoodPrice: 5,
      userDeliveryShare: 2,
      originalServiceFee: 2,
      promoDiscount: 1,
      shareRaw: {
        promotionBadges: ['free_delivery', 'free_service_fee'],
      },
    });
    expect(p.promotionSaving).toBe(1);
    expect(p.grandTotal).toBeGreaterThan(0);
    expect(p.totalSaving).toBeGreaterThan(5);
  });

  it('pricingFromShareDoc maps share fields', () => {
    const p = pricingFromShareDoc({
      originalPrice: 10,
      sharedPrice: 5,
      deliveryShare: 2,
    });
    expect(p.sharedFoodPrice).toBe(5);
    expect(p.sharedDeliveryFee).toBe(2);
  });
});
