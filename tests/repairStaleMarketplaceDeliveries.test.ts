import {
  DEFAULT_STALE_ASSIGNED_MS,
  isStaleAssignedMarketplaceDelivery,
} from '@/lib/staleMarketplaceDelivery';

describe('isStaleAssignedMarketplaceDelivery', () => {
  const now = Date.now();

  it('flags payment_confirmed + driver_assigned when stale and assigned', () => {
    expect(
      isStaleAssignedMarketplaceDelivery(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          status: 'payment_confirmed',
          deliveryStatus: 'driver_assigned',
        },
        now - DEFAULT_STALE_ASSIGNED_MS - 1000,
        { nowMs: now },
      ),
    ).toBe(true);
  });

  it('rejects recent assigned orders', () => {
    expect(
      isStaleAssignedMarketplaceDelivery(
        {
          driverId: 'drv1',
          status: 'payment_confirmed',
          deliveryStatus: 'driver_assigned',
        },
        now,
        { nowMs: now },
      ),
    ).toBe(false);
  });

  it('rejects already terminal orders', () => {
    expect(
      isStaleAssignedMarketplaceDelivery(
        {
          driverId: 'drv1',
          status: 'completed',
          deliveryStatus: 'delivered',
          earningsRecorded: true,
        },
        0,
        { nowMs: now },
      ),
    ).toBe(false);
  });

  it('rejects unassigned orders', () => {
    expect(
      isStaleAssignedMarketplaceDelivery(
        {
          status: 'payment_confirmed',
          deliveryStatus: 'driver_assigned',
        },
        0,
        { nowMs: now },
      ),
    ).toBe(false);
  });
});
