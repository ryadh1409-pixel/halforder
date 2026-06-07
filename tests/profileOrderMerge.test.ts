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
      updatedAtMs: 5000,
    });
    const done = stub({
      id: 'o1',
      status: 'completed',
      deliveryStatus: 'delivered',
      completedAtMs: 4000,
      updatedAtMs: 4000,
    });
    expect(pickBetterProfileOrder(stale, done)).toBe(done);
    expect(pickBetterProfileOrder(done, stale)).toBe(done);
  });

  it('prefers forward courier rank when not completed', () => {
    const assigned = stub({
      id: 'o2',
      deliveryStatus: 'driver_assigned',
      updatedAtMs: 9000,
    });
    const pickedUp = stub({
      id: 'o2',
      deliveryStatus: 'picked_up',
      updatedAtMs: 1000,
    });
    expect(pickBetterProfileOrder(assigned, pickedUp)).toBe(pickedUp);
  });
});
