import {
  driverCourierForwardRank,
  isEffectivelyDelivered,
  pickFreshestActiveDelivery,
  reconcileActiveDeliverySnapshot,
  shouldAcceptDriverCourierSnapshot,
} from '@/lib/driverCourierSnapshotMerge';
import type { ActiveDelivery } from '@/services/delivery';

const T1 = 1_700_000_000_000;
const T2 = 1_700_000_001_000;
const T3 = 1_700_000_002_000;
const T4 = 1_700_000_003_000;
const T5 = 1_700_000_004_000;

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
  it('accepts Firestore when local updatedAt is null', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: null,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T2,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
  });

  it('accepts driver_assigned when Firestore updatedAt is newer than stale ready_for_pickup', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T1,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T2,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
  });

  it('keeps newer local optimistic ready_for_pickup over older driver_assigned', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T2,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T1,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(false);
  });

  it('accepts forward courier step when timestamps tie', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T2,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T2,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
  });

  it('rejects same-rank older updatedAt', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T2,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T1,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(false);
  });

  it('accepts ready_for_pickup -> driver_assigned when Firestore updatedAt is newer', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T2,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T3,
    });
    expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'driver_orders')?.marketplaceCourierStatus,
    ).toBe('driver_assigned');
  });

  it('accepts driver_assigned -> ready_for_pickup -> picked_up -> delivered when timestamps advance', () => {
    const steps: Array<{
      from: ActiveDelivery['marketplaceCourierStatus'];
      to: ActiveDelivery['marketplaceCourierStatus'];
      fromMs: number;
      toMs: number;
    }> = [
      { from: 'driver_assigned', to: 'ready_for_pickup', fromMs: T1, toMs: T2 },
      { from: 'ready_for_pickup', to: 'picked_up', fromMs: T2, toMs: T3 },
      { from: 'picked_up', to: 'delivered', fromMs: T3, toMs: T4 },
    ];

    for (const step of steps) {
      const current = stubActive({
        id: 'o1',
        marketplaceCourierStatus: step.from,
        updatedAtMs: step.fromMs,
      });
      const incoming = stubActive({
        id: 'o1',
        marketplaceCourierStatus: step.to,
        updatedAtMs: step.toMs,
      });
      expect(shouldAcceptDriverCourierSnapshot(current, incoming)).toBe(true);
    }
  });
});

describe('reconcileActiveDeliverySnapshot', () => {
  it('applies driver_assigned when local ready_for_pickup has null updatedAt', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: null,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'driver_assigned',
      updatedAtMs: T2,
    });
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery')
        ?.marketplaceCourierStatus,
    ).toBe('driver_assigned');
  });

  it('returns null when snapshot is older at the same courier rank', () => {
    const current = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T2,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'ready_for_pickup',
      updatedAtMs: T1,
    });
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery'),
    ).toBeNull();
  });
});

describe('pickFreshestActiveDelivery', () => {
  it('prefers newer timestamp over higher courier rank', () => {
    const a = stubActive({ id: 'o1', marketplaceCourierStatus: 'ready_for_pickup', updatedAtMs: T1 });
    const b = stubActive({ id: 'o1', marketplaceCourierStatus: 'driver_assigned', updatedAtMs: T2 });
    expect(pickFreshestActiveDelivery([a, b])?.marketplaceCourierStatus).toBe('driver_assigned');
  });

  it('prefers ready_for_pickup when its timestamp is newer', () => {
    const a = stubActive({ id: 'o1', marketplaceCourierStatus: 'driver_assigned', updatedAtMs: T1 });
    const b = stubActive({ id: 'o1', marketplaceCourierStatus: 'ready_for_pickup', updatedAtMs: T2 });
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
      updatedAtMs: T5,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'delivered',
      updatedAtMs: T1,
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
      updatedAtMs: T5,
    });
    const incoming = stubActive({
      id: 'o1',
      marketplaceCourierStatus: 'picked_up',
      firestoreDeliveryStatus: 'picked_up',
      status: 'completed',
      deliveredAtMs: T4,
      updatedAtMs: T1,
    });
    expect(
      reconcileActiveDeliverySnapshot(current, incoming, 'active_delivery')?.marketplaceCourierStatus,
    ).toBe('delivered');
  });
});
