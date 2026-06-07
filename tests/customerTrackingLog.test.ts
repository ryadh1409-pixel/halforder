import {
  logCustomerTrackingUi,
  resolveCustomerTrackingUi,
} from '@/lib/customerTrackingLog';

describe('customerTrackingLog', () => {
  it('forces delivered UI when status is completed', () => {
    const ui = resolveCustomerTrackingUi({
      status: 'completed',
      deliveryStatus: 'delivered',
      driverId: 'd1',
    });
    expect(ui.delivered).toBe(true);
    expect(ui.currentStep).toBe('delivered');
    expect(ui.displayStatus).toBe('Delivered');
    expect(ui.progress).toBe(1);
  });

  it('forces delivered UI when only deliveryStatus is delivered', () => {
    const ui = resolveCustomerTrackingUi({
      status: 'payment_confirmed',
      deliveryStatus: 'delivered',
      driverId: 'd1',
    });
    expect(ui.delivered).toBe(true);
    expect(ui.title).toBe('Delivered');
  });

  it('logs customer tracking UI fields', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logCustomerTrackingUi('o1', {
      status: 'completed',
      deliveryStatus: 'delivered',
    });
    expect(spy).toHaveBeenCalledWith(
      '[CUSTOMER TRACKING UI]',
      expect.objectContaining({
        orderId: 'o1',
        currentStep: 'delivered',
        displayStatus: 'Delivered',
        delivered: true,
        progress: 1,
      }),
    );
    spy.mockRestore();
  });
});
