import { logCustomerOrderSnapshot } from '@/lib/customerOrderSnapshotLog';

describe('logCustomerOrderSnapshot', () => {
  it('logs raw Firestore lifecycle fields', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logCustomerOrderSnapshot('order-abc', {
      status: 'ready_for_pickup',
      deliveryStatus: 'waiting_driver',
      updatedAtMs: 12345,
    });
    expect(spy).toHaveBeenCalledWith('CUSTOMER SNAPSHOT', {
      orderId: 'order-abc',
      status: 'ready_for_pickup',
      deliveryStatus: 'waiting_driver',
      updatedAt: 12345,
    });
    spy.mockRestore();
  });
});
