import {
  isActiveMarketplaceOrder,
  isTerminalMarketplaceOrder,
} from '@/lib/orderTerminalStatus';

describe('orderTerminalStatus', () => {
  it('treats completed kitchen status as terminal', () => {
    expect(
      isTerminalMarketplaceOrder({
        status: 'completed',
        deliveryStatus: 'picked_up',
      }),
    ).toBe(true);
  });

  it('treats delivered courier as terminal', () => {
    expect(
      isTerminalMarketplaceOrder({
        status: 'picked_up',
        deliveryStatus: 'delivered',
      }),
    ).toBe(true);
  });

  it('treats archived and expired as terminal', () => {
    expect(isTerminalMarketplaceOrder({ status: 'preparing', marketplaceArchived: true })).toBe(
      true,
    );
    expect(isTerminalMarketplaceOrder({ status: 'preparing', expired: true })).toBe(true);
  });

  it('keeps in-progress marketplace orders active', () => {
    expect(
      isActiveMarketplaceOrder({
        status: 'preparing',
        paymentStatus: 'paid',
        deliveryStatus: 'preparing',
      }),
    ).toBe(true);
    expect(
      isActiveMarketplaceOrder({
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        driverId: 'drv1',
      }),
    ).toBe(true);
  });
});
