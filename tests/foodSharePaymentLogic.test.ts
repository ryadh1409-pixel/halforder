import {
  foodSharePaymentDocId,
  isFoodSharePaymentMetadata,
  quoteFoodSharePayment,
} from '../stripe-backend/src/foodSharePaymentLogic';

describe('quoteFoodSharePayment', () => {
  it('computes per-user total from shared food and delivery', () => {
    const quote = quoteFoodSharePayment({ sharedPrice: 10, deliveryShare: 3 });
    expect(quote.foodShareCents).toBe(1000);
    expect(quote.deliveryShareCents).toBe(300);
    expect(quote.totalCents).toBe(1300);
    expect(quote.currency).toBe('usd');
  });

  it('rejects zero totals', () => {
    expect(() => quoteFoodSharePayment({ sharedPrice: 0, deliveryShare: 0 })).toThrow();
  });
});

describe('foodSharePaymentDocId', () => {
  it('uses match and user id', () => {
    expect(foodSharePaymentDocId('card_u0_u1', 'u0')).toBe('card_u0_u1_u0');
  });
});

describe('isFoodSharePaymentMetadata', () => {
  it('detects food share metadata', () => {
    expect(
      isFoodSharePaymentMetadata({ type: 'food_share', matchId: 'm1', userId: 'u1' }),
    ).toBe(true);
    expect(isFoodSharePaymentMetadata({ type: 'order', matchId: 'm1' })).toBe(false);
  });
});
