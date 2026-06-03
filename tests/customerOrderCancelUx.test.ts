import {
  canCustomerCancelMarketplaceOrder,
  isOrderPastCustomerCancelStage,
  resolveCustomerCancelOrderError,
} from '@/lib/customerOrderCancelUx';

describe('customerOrderCancelUx', () => {
  it('allows cancel only for awaiting_payment and awaiting_restaurant', () => {
    expect(
      canCustomerCancelMarketplaceOrder({
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
      }),
    ).toBe(true);
    expect(
      canCustomerCancelMarketplaceOrder({
        status: 'payment_confirmed',
        paymentStatus: 'paid',
        deliveryStatus: 'pending',
      }),
    ).toBe(true);
    expect(
      canCustomerCancelMarketplaceOrder({
        status: 'accepted',
        paymentStatus: 'paid',
        deliveryStatus: 'accepted',
      }),
    ).toBe(false);
    expect(
      canCustomerCancelMarketplaceOrder({
        status: 'preparing',
        paymentStatus: 'paid',
        deliveryStatus: 'preparing',
      }),
    ).toBe(false);
  });

  it('marks accepted kitchen work as past customer cancel', () => {
    expect(
      isOrderPastCustomerCancelStage({
        status: 'accepted',
        paymentStatus: 'paid',
        deliveryStatus: 'accepted',
      }),
    ).toBe(true);
  });

  it('resolves permission-denied after acceptance to restaurant_accepted', () => {
    expect(
      resolveCustomerCancelOrderError(
        { code: 'permission-denied' },
        {
          status: 'accepted',
          paymentStatus: 'paid',
          deliveryStatus: 'accepted',
        },
      ),
    ).toBe('restaurant_accepted');
  });
});
