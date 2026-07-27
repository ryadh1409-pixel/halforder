import {
  aggregateMoneySaved,
  savingsRowFromOrder,
  savingsRowFromPayment,
} from '@/lib/moneySavedAggregation';
import { describe, expect, it } from '@jest/globals';

describe('moneySavedAggregation', () => {
  it('builds payment savings row', () => {
    const row = savingsRowFromPayment('p1', {
      paymentStatus: 'PAID',
      type: 'food_share',
      amount: 13800,
      foodShareCostCents: 5000,
      foodSaving: 5,
      deliverySaving: 2,
      serviceFeeSaving: 1,
      totalSaving: 8,
      restaurantName: 'Burger Co',
      paidAt: { seconds: 1_700_000_000, nanoseconds: 0 },
      matchId: 'm1',
    });
    expect(row?.restaurantName).toBe('Burger Co');
    expect(row?.paid).toBe(138);
    expect(row?.saved).toBe(8);
    expect(row?.isShared).toBe(true);
  });

  it('aggregates monthly and lifetime stats', () => {
    const now = new Date();
    const paidAt = {
      seconds: Math.floor(now.getTime() / 1000),
      nanoseconds: 0,
    };
    const result = aggregateMoneySaved({
      loading: false,
      payments: [
        {
          id: 'p1',
          data: {
            paymentStatus: 'PAID',
            type: 'food_share',
            amount: 8000,
            foodSaving: 5,
            promotionSaving: 1,
            deliverySaving: 2,
            serviceFeeSaving: 1,
            totalSaving: 9,
            foodShareCostCents: 5000,
            matchId: 'm1',
            paidAt,
          },
        },
      ],
      orders: [],
    });
    expect(result.lifetime.totalLifetimeSavings).toBe(9);
    expect(result.currentMonth.sharedOrders).toBe(1);
    expect(result.orderHistory).toHaveLength(1);
  });

  it('dedupes payment and order for same match', () => {
    const result = aggregateMoneySaved({
      loading: false,
      payments: [
        {
          id: 'p1',
          data: {
            paymentStatus: 'PAID',
            type: 'food_share',
            amount: 5000,
            foodSaving: 5,
            totalSaving: 5,
            matchId: 'm1',
          },
        },
      ],
      orders: [
        {
          id: 'o1',
          data: {
            matchId: 'm1',
            orderSource: 'food_share',
            foodSaving: 5,
            totalSaving: 5,
            totalPrice: 50,
          },
        },
      ],
    });
    expect(result.orderHistory).toHaveLength(1);
    expect(result.lifetime.totalLifetimeSavings).toBe(5);
    expect(result.savedFromSharedFood).toBe(5);
  });
});
