import { isDriverActiveMarketplaceOrder } from '@/lib/driverHubActiveOrders';
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
});
