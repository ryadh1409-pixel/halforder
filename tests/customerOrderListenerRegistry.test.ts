import {
  registerCustomerOrderListener,
  unregisterCustomerOrderListener,
} from '@/lib/customerOrderListenerRegistry';

describe('customerOrderListenerRegistry', () => {
  it('detects duplicate listeners on the same order', () => {
    const first = registerCustomerOrderListener('o1', 'listener-a');
    const second = registerCustomerOrderListener('o1', 'listener-b');

    expect(first.duplicate).toBe(false);
    expect(first.activeCount).toBe(1);
    expect(second.duplicate).toBe(true);
    expect(second.activeCount).toBe(2);

    unregisterCustomerOrderListener('o1', 'listener-a');
    const third = registerCustomerOrderListener('o1', 'listener-c');
    expect(third.duplicate).toBe(true);
    expect(third.activeCount).toBe(2);

    unregisterCustomerOrderListener('o1', 'listener-b');
    unregisterCustomerOrderListener('o1', 'listener-c');
  });
});
