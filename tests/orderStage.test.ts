import { applyStageLockToOrder, lockOrderStage } from '@/lib/orderStageLock';
import { wouldDowngradeLifecycle } from '@/lib/orderLifecyclePriority';
import {
  compareOrderStage,
  deriveOrderStage,
  getRestaurantOrderPresentation,
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

  it('allows arrive_restaurant patch when kitchen status still payment_confirmed', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      deliveryStatus: 'ready_for_pickup',
      status: 'ready_for_pickup',
      updatedBy: 'driverMarketplaceArrivedRestaurant',
    });
    expect(safe.deliveryStatus).toBe('ready_for_pickup');
    expect(safe.status).toBe('ready_for_pickup');
  });

  it('does not downgrade lifecycle for driver fulfillment chain from payment_confirmed', () => {
    const base: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
    };
    expect(
      wouldDowngradeLifecycle(base, {
        deliveryStatus: 'ready_for_pickup',
        status: 'ready_for_pickup',
      }),
    ).toBe(false);
    const afterArrive = { ...base, deliveryStatus: 'ready_for_pickup', status: 'ready_for_pickup' };
    expect(
      wouldDowngradeLifecycle(afterArrive, {
        deliveryStatus: 'picked_up',
        status: 'picked_up',
      }),
    ).toBe(false);
    const afterPickup = { ...afterArrive, deliveryStatus: 'picked_up', status: 'picked_up' };
    expect(
      wouldDowngradeLifecycle(afterPickup, {
        deliveryStatus: 'delivered',
        status: 'completed',
      }),
    ).toBe(false);
  });

  it('allows pickup when deliveredAt timestamp regressed but fields are active', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveredAtMs: Date.now(),
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      deliveryStatus: 'picked_up',
      status: 'picked_up',
      updatedBy: 'driverMarketplacePickup',
    });
    expect(safe.deliveryStatus).toBe('picked_up');
    expect(safe.status).toBe('picked_up');
  });

  it('blocks pending_driver kitchen status when courier is already driver_assigned', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'pending_driver',
      deliveryStatus: 'driver_assigned',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      status: 'pending_driver',
      paymentStatus: 'paid',
    });
    expect(safe.status).toBeUndefined();
  });

  it('allows driver_assigned kitchen status on claim when courier becomes driver_assigned', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'pending_driver',
      deliveryStatus: 'pending',
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveryStatus: 'driver_assigned',
      status: 'driver_assigned',
      updatedBy: 'driverService.ts#claimMarketplaceDriverOrder',
    });
    expect(safe.status).toBe('driver_assigned');
    expect(safe.deliveryStatus).toBe('driver_assigned');
  });

  it('allows arrive_restaurant when deliveredAt timestamp regressed but fields are active', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveredAtMs: Date.now(),
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      deliveryStatus: 'ready_for_pickup',
      status: 'ready_for_pickup',
      updatedBy: 'driverMarketplaceArrivedRestaurant',
    });
    expect(safe.deliveryStatus).toBe('ready_for_pickup');
    expect(safe.status).toBe('ready_for_pickup');
  });

  it('allows deliver patch to repair status when timestamps already imply delivered', () => {
    const current: OrderStageInput = {
      id: 'o1',
      paymentStatus: 'paid',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      deliveredAtMs: Date.now(),
    };
    const safe = sanitizeOrderPatchAgainstRegression(current, {
      status: 'completed',
      deliveryStatus: 'delivered',
      earningsRecorded: true,
      marketplaceArchived: true,
    });
    expect(safe.status).toBe('completed');
    expect(safe.deliveryStatus).toBe('delivered');
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

  it('blocks status downgrade from accepted to awaiting_payment', () => {
    const { wouldDowngradeLifecycle } = require('@/lib/orderLifecyclePriority');
    expect(
      wouldDowngradeLifecycle(
        { status: 'accepted', deliveryStatus: 'accepted', paymentStatus: 'paid' },
        { status: 'awaiting_payment', deliveryStatus: 'pending' },
      ),
    ).toBe(true);
  });

  it('paid patch skips lifecycle when acceptedAt is set', () => {
    const { buildOrderPaidStatePatch } = require('@/lib/orderPaidState');
    const patch = buildOrderPaidStatePatch({
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'pending',
      acceptedAt: { seconds: 1 },
    });
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
    expect(patch.paymentStatus).toBe('paid');
  });

  it('fulfilled kitchen status returns payment-only patch', () => {
    const { buildOrderPaidStatePatch } = require('@/lib/orderPaidState');
    const patch = buildOrderPaidStatePatch(
      {
        paymentStatus: 'unpaid',
        status: 'accepted',
        deliveryStatus: 'accepted',
      },
      { paymentIntentId: 'pi_test' },
    );
    expect(patch.paymentStatus).toBe('paid');
    expect(patch.status).toBeUndefined();
    expect(patch.deliveryStatus).toBeUndefined();
    expect(patch.paymentIntentId).toBe('pi_test');
  });

  it('getRestaurantOrderPresentation maps stages to restaurant labels', () => {
    const { getRestaurantOrderPresentation } = require('@/services/orderStage');
    expect(
      getRestaurantOrderPresentation({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'pending',
      }).badgeText,
    ).toBe('Awaiting Restaurant');
    expect(
      getRestaurantOrderPresentation({
        status: 'accepted',
        paymentStatus: 'paid',
        deliveryStatus: 'accepted',
        acceptedAt: { seconds: 1 },
      }).badgeText,
    ).toBe('Accepted');
    expect(
      getRestaurantOrderPresentation({
        status: 'preparing',
        paymentStatus: 'paid',
        deliveryStatus: 'preparing',
        acceptedAt: { seconds: 1 },
        preparedAt: { seconds: 2 },
      }).badgeText,
    ).toBe('Preparing');
    expect(
      getRestaurantOrderPresentation({
        status: 'ready_for_pickup',
        paymentStatus: 'paid',
        deliveryStatus: 'ready_for_pickup',
      }).badgeText,
    ).toBe('Ready For Pickup');
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

  it('stage lock advances kitchen substage within preparing', () => {
    const order: OrderStageInput = {
      id: 'o-lock',
      paymentStatus: 'paid',
      status: 'accepted',
      deliveryStatus: 'accepted',
      acceptedAtMs: 1000,
    };
    lockOrderStage('o-lock', 'preparing', { kitchenSubstage: 'preparing' });
    const locked = applyStageLockToOrder(order);
    expect(getRestaurantOrderPresentation(locked).badgeText).toBe('Preparing');
    expect(getRestaurantOrderPresentation(locked).canStartPreparing).toBe(false);
    expect(getRestaurantOrderPresentation(locked).canReady).toBe(true);
  });
});
