import { isProfileOrderCancelled } from '@/constants/profileOrders';

describe('isProfileOrderCancelled', () => {
  it('returns true when kitchen status is cancelled', () => {
    expect(isProfileOrderCancelled({ status: 'cancelled', deliveryStatus: 'pending' })).toBe(
      true,
    );
  });

  it('returns true when courier deliveryStatus is cancelled', () => {
    expect(
      isProfileOrderCancelled({ status: 'awaiting_payment', deliveryStatus: 'cancelled' }),
    ).toBe(true);
  });

  it('returns false for active marketplace orders', () => {
    expect(
      isProfileOrderCancelled({ status: 'awaiting_payment', deliveryStatus: 'pending' }),
    ).toBe(false);
    expect(
      isProfileOrderCancelled({ status: 'payment_confirmed', deliveryStatus: 'accepted' }),
    ).toBe(false);
  });
});
