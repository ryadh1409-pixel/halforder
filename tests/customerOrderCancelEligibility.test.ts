import {
  diagnoseCustomerCancelOrderWrite,
} from '@/lib/customerOrderCancelEligibility';

describe('diagnoseCustomerCancelOrderWrite', () => {
  const patch = {
    status: 'cancelled',
    deliveryStatus: 'cancelled',
    cancelledBy: 'cust1',
  };

  it('allows paid payment_confirmed before driver assignment', () => {
    const result = diagnoseCustomerCancelOrderWrite(
      {
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        paymentStatus: 'paid',
        customerId: 'cust1',
        userId: 'cust1',
      },
      'cust1',
      patch,
    );
    expect(result.allowed).toBe(true);
    expect(result.rejectBranch).toBeNull();
  });

  it('rejects when status is not in firestore cancellable list', () => {
    const result = diagnoseCustomerCancelOrderWrite(
      {
        status: 'picked_up',
        deliveryStatus: 'picked_up',
        paymentStatus: 'paid',
        customerId: 'cust1',
      },
      'cust1',
      patch,
    );
    expect(result.allowed).toBe(false);
    expect(result.rejectBranch).toMatch(/stage:blocked/);
  });
});
