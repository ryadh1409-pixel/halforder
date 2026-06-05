import {
  customerTrackStepFlags,
  logCustomerOrderPipeline,
} from '@/lib/customerOrderPipelineLog';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';

describe('customerOrderPipelineLog', () => {
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
