import {
  customerTrackStepFlags,
  logCustomerOrderPipeline,
} from '@/lib/customerOrderPipelineLog';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';

describe('customerOrderPipelineLog', () => {
  it('flags driver_assigned when kitchen status is still payment_confirmed', () => {
    const flags = customerTrackStepFlags(
      resolveCustomerTrackStep({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
      }),
      {
        status: 'payment_confirmed',
        deliveryStatus: 'driver_assigned',
        driverId: 'driver-1',
      },
    );
    expect(flags.driver_assigned).toBe(true);
    expect(flags.delivered).toBe(false);
  });

  it('flags all steps when deliveryStatus is delivered despite payment_confirmed status', () => {
    const order = {
      status: 'payment_confirmed',
      paymentStatus: 'paid',
      deliveryStatus: 'delivered',
      driverId: 'driver-1',
    };
    const flags = customerTrackStepFlags(resolveCustomerTrackStep(order), order);
    expect(flags.delivered).toBe(true);
    expect(flags.picked_up).toBe(true);
    expect(flags.driver_assigned).toBe(true);
  });

  it('flags only order_placed when Firestore is still payment_confirmed', () => {
    const flags = customerTrackStepFlags(
      resolveCustomerTrackStep({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'pending',
      }),
    );
    expect(flags.order_placed).toBe(true);
    expect(flags.restaurant_accepted).toBe(false);
    expect(flags.preparing).toBe(false);
    expect(flags.ready_for_pickup).toBe(false);
  });

  it('flags through preparing when Firestore has preparing', () => {
    const flags = customerTrackStepFlags(
      resolveCustomerTrackStep({
        status: 'preparing',
        paymentStatus: 'paid',
        deliveryStatus: 'preparing',
      }),
    );
    expect(flags.order_placed).toBe(true);
    expect(flags.restaurant_accepted).toBe(true);
    expect(flags.preparing).toBe(true);
    expect(flags.ready_for_pickup).toBe(false);
  });

  it('logs raw vs derived stage', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logCustomerOrderPipeline('track-order', 'o1', {
      status: 'preparing',
      deliveryStatus: 'preparing',
      paymentStatus: 'paid',
    });
    expect(spy).toHaveBeenCalledWith(
      'CUSTOMER_ORDER_PIPELINE',
      expect.objectContaining({
        orderId: 'o1',
        raw: { status: 'preparing', deliveryStatus: 'preparing', paymentStatus: 'paid', updatedAt: null },
        derivedCustomerStage: 'preparing',
        stepFlags: expect.objectContaining({
          preparing: true,
          ready_for_pickup: false,
        }),
      }),
    );
    spy.mockRestore();
  });
});
