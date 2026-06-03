import {
  compareOrderStage,
  deriveOrderStage,
  sanitizeOrderPatchAgainstRegression,
  type OrderStageInput,
} from '@/services/orderStage';

describe('deriveOrderStage', () => {
  it('returns awaiting_payment when not paid', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'unpaid',
        status: 'pending',
      }),
    ).toBe('awaiting_payment');
  });

  it('returns awaiting_restaurant when paid and kitchen pending', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'paid',
        status: 'pending',
        deliveryStatus: 'pending',
      }),
    ).toBe('awaiting_restaurant');
  });

  it('returns preparing when status accepted even if deliveryStatus still pending', () => {
    expect(
      deriveOrderStage({
        id: 'o1',
        paymentStatus: 'paid',
        status: 'accepted',
        deliveryStatus: 'pending',
      }),
    ).toBe('preparing');
  });

  it('returns preparing when deliveryStatus accepted even if status still payment_confirmed', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'accepted',
      }),
    ).toBe('preparing');
  });

  it('returns driver_assigned when driver set and not picked up', () => {
    const order: OrderStageInput = {
      paymentStatus: 'paid',
      status: 'accepted',
      deliveryStatus: 'driver_assigned',
      driverId: 'driver-1',
    };
    expect(deriveOrderStage(order)).toBe('driver_assigned');
  });

  it('returns picked_up when pickedUpAt is set', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'paid',
        status: 'accepted',
        driverId: 'driver-1',
        pickedUpAtMs: Date.now(),
      }),
    ).toBe('picked_up');
  });

  it('returns driver_assignment when ready for pickup without driver', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe('driver_assignment');
  });

  it('blocks payment webhook patch from downgrading accepted order', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'accepted',
      deliveryStatus: 'accepted',
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      paymentStatus: 'paid',
      status: 'payment_confirmed',
      deliveryStatus: 'pending',
    });
    expect(safe.deliveryStatus).toBeUndefined();
    expect(safe.status).toBeUndefined();
    expect(deriveOrderStage({ ...current, ...safe })).toBe('preparing');
  });

  it('compareOrderStage ranks preparing after awaiting_restaurant', () => {
    expect(
      compareOrderStage('preparing', 'awaiting_restaurant'),
    ).toBeGreaterThan(0);
  });

  it('paid patch does not reset deliveryStatus when courier already accepted', () => {
    const { buildOrderPaidStatePatch } = require('@/lib/orderPaidState');
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'paid',
        status: 'payment_confirmed',
        deliveryStatus: 'accepted',
      },
      {},
    );
    expect(patch.deliveryStatus).toBeUndefined();
  });

  it('paid awaiting_payment maps to awaiting_restaurant not awaiting_payment', () => {
    expect(
      deriveOrderStage({
        paymentStatus: 'paid',
        status: 'awaiting_payment',
        deliveryStatus: 'pending',
      }),
    ).toBe('awaiting_restaurant');
  });
});
