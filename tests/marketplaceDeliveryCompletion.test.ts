import {
  buildMarketplaceDeliveryCompletionPatch,
  patchRegressesTerminalDelivery,
} from '@/lib/marketplaceDeliveryCompletion';
import { sanitizeOrderPatchAgainstRegression } from '@/services/orderStage';

describe('buildMarketplaceDeliveryCompletionPatch', () => {
  it('includes all required terminal marketplace fields', () => {
    const patch = buildMarketplaceDeliveryCompletionPatch(
      { totalPrice: 24, deliveryFee: 4 },
      'test#complete',
    );
    expect(patch.status).toBe('completed');
    expect(patch.deliveryStatus).toBe('delivered');
    expect(patch.marketplaceArchived).toBe(true);
    expect(patch.earningsRecorded).toBe(true);
    expect(patch.completedAt).toBeDefined();
    expect(patch.deliveredAt).toBeDefined();
    expect(patch.updatedBy).toBe('test#complete');
    expect(patch.driverPayout).toEqual(expect.any(Number));
  });
});

describe('patchRegressesTerminalDelivery', () => {
  it('detects rewind from completed to payment_confirmed + driver_assigned', () => {
    expect(
      patchRegressesTerminalDelivery(
        {
          status: 'completed',
          deliveryStatus: 'delivered',
          marketplaceArchived: true,
          earningsRecorded: true,
        },
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned' },
      ),
    ).toBe(true);
  });

  it('allows idempotent completed patch', () => {
    expect(
      patchRegressesTerminalDelivery(
        {
          status: 'completed',
          deliveryStatus: 'delivered',
          earningsRecorded: true,
        },
        { status: 'completed', deliveryStatus: 'delivered' },
      ),
    ).toBe(false);
  });
});

describe('sanitizeOrderPatchAgainstRegression terminal guard', () => {
  it('blocks payment_confirmed rewrite on completed marketplace order', () => {
    const safe = sanitizeOrderPatchAgainstRegression(
      {
        id: 'o1',
        paymentStatus: 'paid',
        status: 'completed',
        deliveryStatus: 'delivered',
        earningsRecorded: true,
        marketplaceArchived: true,
      } as import('@/services/orderStage').OrderStageInput,
      {
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        paymentStatus: 'paid',
      },
    );
    expect(safe.status).toBeUndefined();
    expect(safe.deliveryStatus).toBeUndefined();
  });
});
