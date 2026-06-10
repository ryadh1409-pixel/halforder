import {
  logOrderLifecycleTransition,
  resolveOrderLifecycleMilestone,
} from '@/lib/orderLifecycleTransitionLog';

describe('resolveOrderLifecycleMilestone', () => {
  it('maps payment_confirmed + driver_assigned split state', () => {
    expect(
      resolveOrderLifecycleMilestone('payment_confirmed', 'driver_assigned'),
    ).toBe('driver_assigned');
  });

  it('maps completed terminal state', () => {
    expect(resolveOrderLifecycleMilestone('completed', 'delivered')).toBe('completed');
  });
});

describe('logOrderLifecycleTransition', () => {
  it('logs driver_assigned transition from payment_confirmed', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logOrderLifecycleTransition('uMIFqPqbxlE9AjNp7dAx', 'payment_confirmed', 'payment_confirmed', {
      previousDeliveryStatus: 'pending',
      newDeliveryStatus: 'driver_assigned',
      source: 'driverService.ts#claimMarketplaceDriverOrder',
    });
    expect(spy).toHaveBeenCalledWith(
      '[ORDER LIFECYCLE TRANSITION]',
      expect.objectContaining({
        orderId: 'uMIFqPqbxlE9AjNp7dAx',
        fromMilestone: 'payment_confirmed',
        toMilestone: 'driver_assigned',
      }),
    );
    spy.mockRestore();
  });
});
