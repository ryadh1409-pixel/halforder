import {
  buildOrderPaidStatePatch,
  buildPaymentOnlyPaidStatePatch,
} from '@/lib/orderPaidState';

describe('orderPaidState terminal guards', () => {
  it('returns payment-only when order is completed/delivered', () => {
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'paid',
        status: 'completed',
        deliveryStatus: 'delivered',
        driverId: 'driver-1',
        earningsRecorded: true,
        marketplaceArchived: true,
        deliveredAt: { seconds: 1 },
      },
      { stripeWebhookLastEventType: 'payment_intent.succeeded' },
    );
    expect(patch.paymentStatus).toBe('paid');
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
    expect(patch.stripeWebhookLastEventType).toBe('payment_intent.succeeded');
  });

  it('returns payment-only when courier is driver_assigned (prevents payment_confirmed + driver_assigned reassert)', () => {
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
      },
      {},
    );
    expect(patch.paymentStatus).toBe('paid');
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
  });

  it('returns payment-only when completedAt is set even if status lags', () => {
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'delivered',
        completedAt: { seconds: 99 },
        driverId: 'driver-1',
      },
      {},
    );
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
  });

  it('still writes payment_confirmed for fresh unpaid orders', () => {
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'unpaid',
        status: 'awaiting_payment',
        deliveryStatus: 'pending',
      },
      { paymentIntentId: 'pi_new' },
    );
    expect(patch.paymentStatus).toBe('paid');
    expect(patch.status).toBe('payment_confirmed');
    expect(patch.deliveryStatus).toBe('pending');
    expect(patch.paymentIntentId).toBe('pi_new');
  });

  it('buildPaymentOnlyPaidStatePatch never includes lifecycle fields', () => {
    const patch = buildPaymentOnlyPaidStatePatch({
      paymentIntentId: 'pi_retry',
      stripeWebhookLastEventType: 'checkout.session.completed',
    });
    expect(patch.paymentStatus).toBe('paid');
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
    expect(patch.paymentIntentId).toBe('pi_retry');
  });
});
