import {
  isDriverActiveMarketplaceOrder,
  isDriverCompletedMarketplaceOrder,
} from '@/lib/driverHubActiveOrders';
import { MARKETPLACE_DELIVERY_STATUS } from '@/lib/orderStatus';

describe('isDriverActiveMarketplaceOrder', () => {
  it('includes assigned orders with driver_assigned courier status', () => {
    expect(
      isDriverActiveMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DRIVER_ASSIGNED,
        },
        'drv1',
      ),
    ).toBe(true);
  });

  it('excludes unassigned pool orders', () => {
    expect(
      isDriverActiveMarketplaceOrder(
        { driverId: null, assignedDriverId: null, deliveryStatus: 'pending' },
        'drv1',
      ),
    ).toBe(false);
  });

  it('excludes delivered courier status', () => {
    expect(
      isDriverActiveMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
        },
        'drv1',
      ),
    ).toBe(false);
  });

  it('excludes status completed even when courier field lags picked_up', () => {
    expect(
      isDriverActiveMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
          status: 'completed',
          deliveredAtMs: Date.now(),
        },
        'drv1',
      ),
    ).toBe(false);
  });

  it('excludes raw firestore deliveryStatus delivered', () => {
    expect(
      isDriverActiveMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'delivered',
          status: 'completed',
        },
        'drv1',
      ),
    ).toBe(false);
  });
});

describe('isDriverCompletedMarketplaceOrder', () => {
  it('includes delivered courier status', () => {
    expect(
      isDriverCompletedMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.DELIVERED,
        },
        'drv1',
      ),
    ).toBe(true);
  });

  it('includes status completed with deliveredAt', () => {
    expect(
      isDriverCompletedMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
          status: 'completed',
          deliveredAtMs: Date.now(),
        },
        'drv1',
      ),
    ).toBe(true);
  });

  it('excludes in-progress courier status', () => {
    expect(
      isDriverCompletedMarketplaceOrder(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: MARKETPLACE_DELIVERY_STATUS.PICKED_UP,
        },
        'drv1',
      ),
    ).toBe(false);
  });
});
