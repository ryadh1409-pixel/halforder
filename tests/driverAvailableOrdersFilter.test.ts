import {
  excludeActiveOrderIdsFromAvailable,
  excludeAssignedOrderIdsFromAvailable,
  filterDriverAvailableMarketplaceOrders,
  isDriverMarketplaceOrderAvailableForClaim,
  isDriverMarketplacePoolDocAvailable,
  markDriverMarketplaceOrderClaimed,
} from '@/lib/driverAvailableOrdersFilter';

const ORDER_ID = 'LWbcKKwqud83ufJICXnZ';
const DRIVER_UID = '9XN334yG4hOglrOYfsehHPDM5zP2';

describe('isDriverMarketplaceOrderAvailableForClaim', () => {
  it('allows unassigned payment_confirmed + ready_for_pickup pool row', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        driverId: null,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(true);
  });

  it('rejects LWbcKKwqud83ufJICXnZ assigned order state', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        id: ORDER_ID,
        driverId: DRIVER_UID,
        assignedDriverId: DRIVER_UID,
        status: 'driver_assigned',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(false);
  });

  it('rejects when only driverId is set', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        driverId: DRIVER_UID,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
      }),
    ).toBe(false);
  });

  it('rejects when only assignedDriverId is set', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        driverId: null,
        assignedDriverId: DRIVER_UID,
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
      }),
    ).toBe(false);
  });

  it('rejects status driver_assigned even without driver fields (stale pool)', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        driverId: null,
        assignedDriverId: null,
        status: 'driver_assigned',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(false);
  });

  it('rejects deliveryStatus driver_assigned', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        driverId: null,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
      }),
    ).toBe(false);
  });

  it('rejects picked_up and delivered lifecycle states', () => {
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        status: 'picked_up',
        deliveryStatus: 'picked_up',
      }),
    ).toBe(false);
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        status: 'delivered',
        deliveryStatus: 'delivered',
      }),
    ).toBe(false);
  });
});

describe('filterDriverAvailableMarketplaceOrders', () => {
  it('removes assigned orders from a mixed batch', () => {
    const rows = filterDriverAvailableMarketplaceOrders([
      {
        id: 'pool1',
        driverId: null,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
      },
      {
        id: ORDER_ID,
        driverId: DRIVER_UID,
        assignedDriverId: DRIVER_UID,
        status: 'driver_assigned',
        deliveryStatus: 'ready_for_pickup',
      },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['pool1']);
  });
});

describe('excludeAssignedOrderIdsFromAvailable', () => {
  it('removes orders assigned to the current driver', () => {
    const assigned = new Set([ORDER_ID]);
    const visible = excludeAssignedOrderIdsFromAvailable(
      [
        { id: ORDER_ID, status: 'payment_confirmed', deliveryStatus: 'pending' },
        { id: 'other', status: 'payment_confirmed', deliveryStatus: 'pending' },
      ],
      assigned,
    );
    expect(visible.map((o) => o.id)).toEqual(['other']);
  });
});

describe('markDriverMarketplaceOrderClaimed', () => {
  it('excludes order immediately before listeners update', () => {
    markDriverMarketplaceOrderClaimed(ORDER_ID);
    expect(
      isDriverMarketplaceOrderAvailableForClaim({
        id: ORDER_ID,
        driverId: null,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(false);
  });
});

describe('isDriverMarketplacePoolDocAvailable', () => {
  it('rejects pool raw doc with assignedDriverId', () => {
    expect(
      isDriverMarketplacePoolDocAvailable(ORDER_ID, {
        driverId: null,
        assignedDriverId: DRIVER_UID,
        status: 'payment_confirmed',
        deliveryStatus: 'ready_for_pickup',
      }),
    ).toBe(false);
  });

  it('allows unassigned pool raw doc', () => {
    expect(
      isDriverMarketplacePoolDocAvailable('pool1', {
        driverId: null,
        assignedDriverId: null,
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
      }),
    ).toBe(true);
  });
});

describe('excludeActiveOrderIdsFromAvailable', () => {
  it('prevents the same order from appearing in both hub sections', () => {
    const available = [
      { id: ORDER_ID, status: 'payment_confirmed', deliveryStatus: 'pending' },
      { id: 'other', status: 'payment_confirmed', deliveryStatus: 'pending' },
    ];
    const active = [
      {
        id: ORDER_ID,
        driverId: DRIVER_UID,
        assignedDriverId: DRIVER_UID,
        status: 'driver_assigned',
        deliveryStatus: 'ready_for_pickup',
      },
    ];
    const visible = excludeActiveOrderIdsFromAvailable(available, active);
    expect(visible.map((o) => o.id)).toEqual(['other']);
  });
});
