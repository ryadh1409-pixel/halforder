import { pickPrimaryDriverHubActiveOrder } from '@/lib/driverHubActiveOrders';

describe('pickPrimaryDriverHubActiveOrder', () => {
  it('returns only the highest-stage active delivery', () => {
    const rows = pickPrimaryDriverHubActiveOrder(
      [
        {
          id: 'a',
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'driver_assigned',
          createdAtMs: 100,
        },
        {
          id: 'b',
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'picked_up',
          createdAtMs: 50,
        },
      ],
      'drv1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('b');
  });

  it('excludes completed orders', () => {
    const rows = pickPrimaryDriverHubActiveOrder(
      [
        {
          id: 'done',
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'delivered',
          status: 'completed',
        },
        {
          id: 'live',
          driverId: 'drv1',
          assignedDriverId: 'drv1',
          deliveryStatus: 'picked_up',
        },
      ],
      'drv1',
    );
    expect(rows.map((r) => r.id)).toEqual(['live']);
  });
});
