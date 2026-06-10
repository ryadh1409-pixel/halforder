import {
  applyDriverMarketplaceFulfillment,
  getDriverMarketplaceFulfillmentButton,
  isDriverMarketplaceDeliveryComplete,
} from '@/lib/driverMarketplaceFulfillment';

jest.mock('@/services/orderFirestoreWrite', () => ({
  protectedUpdateOrder: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/firebase', () => ({
  db: {},
}));

const mockGetDoc = jest.fn();
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
}));

jest.mock('@/lib/driverHubOrdersStore', () => ({
  markDriverHubOrderCompleted: jest.fn(),
}));

jest.mock('@/lib/orderStageLock', () => ({
  clearOrderStageLock: jest.fn(),
}));

jest.mock('@/lib/orderListenerCommit', () => ({
  clearOrderListenerCommitCache: jest.fn(),
}));

import { protectedUpdateOrder } from '@/services/orderFirestoreWrite';

describe('driverMarketplaceFulfillment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows Arrived at Restaurant when driver_assigned', () => {
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'driver_assigned',
        },
        'drv1',
      ),
    ).toEqual({ label: 'Arrived at Restaurant', action: 'arrive_restaurant' });
  });

  it('shows Confirm Pickup when ready_for_pickup', () => {
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'ready_for_pickup',
        },
        'drv1',
      ),
    ).toEqual({ label: 'Confirm Pickup', action: 'pickup' });
  });

  it('shows Complete Delivery after picked_up', () => {
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'picked_up',
        },
        'drv1',
      ),
    ).toEqual({ label: 'Complete Delivery', action: 'deliver' });
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'ready_for_pickup',
        },
        'drv1',
      )?.action,
    ).not.toBe('deliver');
  });

  it('hides action and marks complete when delivered', () => {
    const order = {
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveryStatus: 'delivered',
    };
    expect(getDriverMarketplaceFulfillmentButton(order, 'drv1')).toBeNull();
    expect(isDriverMarketplaceDeliveryComplete(order, 'drv1')).toBe(true);
  });

  it('writes ready_for_pickup on arrive_restaurant', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        driverId: 'drv1',
        assignedDriverId: 'drv1',
        deliveryStatus: 'driver_assigned',
        status: 'payment_confirmed',
      }),
    });
    const result = await applyDriverMarketplaceFulfillment(
      'o1',
      'arrive_restaurant',
      {
        id: 'o1',
        driverId: 'drv1',
        deliveryStatus: 'driver_assigned',
      },
    );
    expect(result).toBe('applied');
    expect(protectedUpdateOrder).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        deliveryStatus: 'ready_for_pickup',
        status: 'ready_for_pickup',
      }),
      expect.any(Object),
    );
  });

  it('writes picked_up on pickup', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        driverId: 'drv1',
        assignedDriverId: 'drv1',
        deliveryStatus: 'ready_for_pickup',
        status: 'ready_for_pickup',
      }),
    });
    const result = await applyDriverMarketplaceFulfillment(
      'o1',
      'pickup',
      {
        id: 'o1',
        driverId: 'drv1',
        deliveryStatus: 'ready_for_pickup',
      },
    );
    expect(result).toBe('applied');
    expect(protectedUpdateOrder).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ deliveryStatus: 'picked_up', status: 'picked_up' }),
      expect.any(Object),
    );
  });

  it('writes completed delivery fields on deliver', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        driverId: 'drv1',
        assignedDriverId: 'drv1',
        deliveryStatus: 'picked_up',
        status: 'picked_up',
        totalPrice: 20,
        deliveryFee: 4,
      }),
    });
    const result = await applyDriverMarketplaceFulfillment(
      'o1',
      'deliver',
      {
        id: 'o1',
        driverId: 'drv1',
        deliveryStatus: 'picked_up',
      },
    );
    expect(result).toBe('applied');
    expect(protectedUpdateOrder).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({
        deliveryStatus: 'delivered',
        status: 'completed',
        marketplaceArchived: true,
        earningsRecorded: true,
        driverPayout: expect.any(Number),
        platformFee: expect.any(Number),
      }),
      expect.any(Object),
    );
  });
});
