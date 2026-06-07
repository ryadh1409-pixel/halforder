import { pickBetterProfileOrder } from '@/lib/profileOrderMerge';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';

function stub(partial: Partial<ProfileOrderRow> & { id: string }): ProfileOrderRow {
  return {
    status: 'payment_confirmed',
    deliveryStatus: 'pending',
    paymentStatus: 'paid',
    restaurantName: 'R',
    totalPrice: 10,
    subtotal: 10,
    fees: 0,
    deliveryAddress: '—',
    driverId: null,
    assignedDriverId: null,
    driverName: null,
    driverPhone: null,
    itemsCount: 1,
    createdAtMs: Date.now(),
    imageUrl: null,
    ...partial,
  };
}

describe('profileOrderMerge', () => {
  it('prefers completed row over stale active duplicate', () => {
    const stale = stub({
      id: 'o1',
      status: 'payment_confirmed',
      deliveryStatus: 'driver_assigned',
      updatedAtMs: 1_700_000_004_000,
    });
    const done = stub({
      id: 'o1',
      status: 'completed',
      deliveryStatus: 'delivered',
      completedAtMs: 1_700_000_001_000,
      updatedAtMs: 1_700_000_001_000,
    });
    expect(pickBetterProfileOrder(stale, done)).toBe(done);
    expect(pickBetterProfileOrder(done, stale)).toBe(done);
  });

  it('prefers newer updatedAt when timestamps differ', () => {
    const assigned = stub({
      id: 'o2',
      deliveryStatus: 'driver_assigned',
      updatedAtMs: 1_700_000_004_000,
    });
    const pickedUp = stub({
      id: 'o2',
      deliveryStatus: 'picked_up',
      updatedAtMs: 1_700_000_001_000,
    });
    expect(pickBetterProfileOrder(assigned, pickedUp)).toBe(assigned);
  });

  it('prefers higher delivery rank when updatedAt is equal', () => {
    const assigned = stub({
      id: 'o3',
      deliveryStatus: 'driver_assigned',
      driverId: 'd1',
      updatedAtMs: 1_700_000_003_000,
    });
    const pickedUp = stub({
      id: 'o3',
      deliveryStatus: 'picked_up',
      driverId: 'd1',
      updatedAtMs: 1_700_000_003_000,
    });
    expect(pickBetterProfileOrder(assigned, pickedUp)).toBe(pickedUp);
  });
});
