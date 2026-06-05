import { logCustomerOrderSnapshot } from '@/lib/customerOrderSnapshotLog';

describe('logCustomerOrderSnapshot', () => {
  it('logs raw Firestore lifecycle fields and derived stage', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logCustomerOrderSnapshot('order-abc', {
      status: 'ready_for_pickup',
      deliveryStatus: 'waiting_driver',
      paymentStatus: 'paid',
      updatedAtMs: 12345,
    });
    expect(spy).toHaveBeenCalledWith(
      'CUSTOMER SNAPSHOT',
      expect.objectContaining({
        orderId: 'order-abc',
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
        marketplaceCourierStatus: 'ready_for_pickup',
        derivedCustomerStage: 'ready_for_pickup',
        updatedAt: 12345,
      }),
    );
    spy.mockRestore();
  });
});
