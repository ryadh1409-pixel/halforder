import {
  applyDriverMarketplaceFulfillment,
  getDriverMarketplaceFulfillmentButton,
} from '@/lib/driverMarketplaceFulfillment';

jest.mock('@/services/orderFirestoreWrite', () => ({
  protectedUpdateOrder: jest.fn().mockResolvedValue(undefined),
}));

import { protectedUpdateOrder } from '@/services/orderFirestoreWrite';

describe('driverMarketplaceFulfillment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows Pick Up Order only when ready_for_pickup', () => {
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'ready_for_pickup',
        },
        'drv1',
      ),
    ).toEqual({ label: 'Pick Up Order', action: 'pickup' });
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'driver_assigned',
        },
        'drv1',
      ),
    ).toBeNull();
  });

  it('shows Deliver Order only after picked_up', () => {
    expect(
      getDriverMarketplaceFulfillmentButton(
        {
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'picked_up',
        },
        'drv1',
      ),
    ).toEqual({ label: 'Deliver Order', action: 'deliver' });
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

  it('writes picked_up on pickup', async () => {
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
      expect.objectContaining({ deliveryStatus: 'picked_up' }),
      expect.any(Object),
    );
  });
});
