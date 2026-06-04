import {
  driverCourierForwardRank,
  isEffectivelyDelivered,
  pickFreshestActiveDelivery,
  reconcileActiveDeliverySnapshot,
  shouldAcceptDriverCourierSnapshot,
} from '@/lib/driverCourierSnapshotMerge';
import type { ActiveDelivery } from '@/services/delivery';

function stubActive(partial: Partial<ActiveDelivery> & { id: string }): ActiveDelivery {
  return {
    customerId: null,
    restaurantName: 'R',
    restaurantImage: null,
    restaurantPhone: null,
    customerName: null,
    customerPhone: null,
    deliveryAddress: null,
    items: [],
    itemCount: 0,
    subtotal: 0,
    fees: 0,
    payout: 0,
    distanceKm: null,
    estimatedDurationMin: 20,
    orderAgeMin: 0,
    createdAtMs: 1000,
    status: 'pending_driver',
    deliveryStatus: 'accepted',
    marketplaceCourierStatus: 'driver_assigned',
    firestoreDeliveryStatus: 'driver_assigned',
    updatedAtMs: 1000,
    driverId: 'd1',
    assignedDriverId: 'd1',
    acceptedAtMs: null,
    pickedUpAtMs: null,
    deliveredAtMs: null,
    notes: null,
    customerInstructions: null,
    pickupNotes: null,
    restaurantAddress: null,
    restaurantLocation: null,
    customerLocation: null,
    driverLocation: null,
    timeline: [],
    driverName: null,
    driverPhone: null,
    ...partial,
  } as ActiveDelivery;
}

describe('driverCourierForwardRank', () => {
  it('orders driver fulfillment chain', () => {
    expect(driverCourierForwardRank('driver_assigned')).toBeLessThan(
      driverCourierForwardRank('ready_for_pickup'),
    );
    expect(driverCourierForwardRank('ready_for_pickup')).toBeLessThan(
      driverCourierForwardRank('picked_up'),
    );
    expect(driverCourierForwardRank('picked_up')).toBeLessThan(
      driverCourierForwardRank('delivered'),
    );
  });
});

describe('shouldAcceptDriverCourierSnapshot', () => {
  it('rejects courier regression even with newer updatedAt', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: 1000,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: 2000,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(false);
  });

  it('accepts forward courier step', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: 2000,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: 1000,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
  });

  it('rejects same-rank older updatedAt', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: 2000,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: 1000,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(false);
  });
});

describe('reconcileActiveDeliverySnapshot', () => {
  it('returns null when snapshot regresses courier', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: 100,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: 50,
    });
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery'),
    ).toBeNull();
  });
});

describe('pickFreshestActiveDelivery', () => {
  it('prefers ready_for_pickup over driver_assigned', () => {
    const a = stubActive({ id: 'o1', marketplaceCourierStatus: 'driver_assigned', updatedAtMs: 500 });
    const b = stubActive({ id: 'o1', marketplaceCourierStatus: 'ready_for_pickup', updatedAtMs: 400 });
    expect(pickFreshestActiveDelivery([a, b])?.marketplaceCourierStatus).toBe('ready_for_pickup');
  });
});

describe('delivered snapshot merge', () => {
  it('detects delivered from status completed when courier field lags', () => {
    const row = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'picked_up',
      firestoreDeliveryStatus: 'picked_up',
      status: 'completed',
      deliveredAtMs: 5000,
    });
    expect(isEffectivelyDelivered(row)).toBe(true);
  });

  it('accepts picked_up -> delivered even when delivered updatedAt is older', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'picked_up',
      updatedAtMs: 5000,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'delivered',
      updatedAtMs: 1000,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery')?.marketplaceCourierStatus,
    ).toBe('delivered');
  });

  it('never keeps picked_up when incoming is effectively delivered via completed status', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'picked_up',
      updatedAtMs: 9000,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'picked_up',
      firestoreDeliveryStatus: 'picked_up',
      status: 'completed',
      deliveredAtMs: 8000,
      updatedAtMs: 1000,
    });
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery')?.marketplaceCourierStatus,
    ).toBe('delivered');
  });
});
