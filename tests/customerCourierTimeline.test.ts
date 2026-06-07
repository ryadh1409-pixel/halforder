import { resolveCustomerCourierRank } from '@/lib/customerCourierRank';
import { logCustomerTimeline } from '@/lib/customerTrackingLog';
import {
  customerTrackHeaderTitle,
  customerTrackStepLabel,
  resolveCustomerTrackStep,
} from '@/lib/customerTrackStatus';

describe('customer courier timeline progression', () => {
  it('maps ready_for_pickup to Driver at restaurant', () => {
    const order = {
      status: 'payment_confirmed',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'd1',
    };
    expect(resolveCustomerCourierRank(order)).toBe(2);
    expect(resolveCustomerTrackStep(order)).toBe('driver_at_restaurant');
    expect(customerTrackHeaderTitle('driver_at_restaurant')).toBe('Driver at restaurant');
    expect(customerTrackStepLabel('driver_at_restaurant')).toBe('Driver at restaurant');
  });

  it('maps picked_up to Picked up', () => {
    const order = {
      status: 'payment_confirmed',
      deliveryStatus: 'picked_up',
      driverId: 'd1',
    };
    expect(resolveCustomerCourierRank(order)).toBe(3);
    expect(resolveCustomerTrackStep(order)).toBe('picked_up');
    expect(customerTrackStepLabel('picked_up')).toBe('Picked up');
  });

  it('maps delivered/completed to Delivered', () => {
    const order = {
      status: 'completed',
      deliveryStatus: 'delivered',
      driverId: 'd1',
    };
    expect(resolveCustomerCourierRank(order)).toBe(4);
    expect(resolveCustomerTrackStep(order)).toBe('delivered');
    expect(customerTrackStepLabel('delivered')).toBe('Delivered');
  });

  it('logs [CUSTOMER TIMELINE] with derivedStage and timelineStep', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logCustomerTimeline('o1', {
      status: 'payment_confirmed',
      deliveryStatus: 'picked_up',
      driverId: 'd1',
    });
    expect(spy).toHaveBeenCalledWith(
      '[CUSTOMER TIMELINE]',
      expect.objectContaining({
        orderId: 'o1',
        derivedStage: 'picked_up',
        timelineStep: 'Picked up',
        courierRank: 3,
      }),
    );
    spy.mockRestore();
  });
});
