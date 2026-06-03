jest.mock('@/services/orderService', () => ({
  applyProtectedOrderPatch: jest.fn(),
}));
jest.mock('@/services/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'SERVER_TS'),
}));

import {
  buildRestaurantKitchenPatch,
  isDuplicateKitchenTransition,
  isLegalRestaurantKitchenAction,
  optimisticRestaurantOrderPatch,
} from '@/lib/restaurantKitchenActions';

describe('restaurantKitchenActions', () => {
  it('builds preparing patch with restaurantPreparing', () => {
    const patch = buildRestaurantKitchenPatch('preparing');
    expect(patch.status).toBe('preparing');
    expect(patch.deliveryStatus).toBe('preparing');
    expect(patch.updatedBy).toBe('restaurantPreparing');
    expect(patch.preparedAt).toBeDefined();
  });

  it('builds ready patch with ready_for_pickup statuses', () => {
    const patch = buildRestaurantKitchenPatch('ready');
    expect(patch.status).toBe('ready_for_pickup');
    expect(patch.deliveryStatus).toBe('ready_for_pickup');
  });

  it('detects duplicate transitions', () => {
    expect(
      isDuplicateKitchenTransition(
        { status: 'preparing', deliveryStatus: 'preparing' },
        { status: 'preparing', deliveryStatus: 'preparing' },
      ),
    ).toBe(true);
  });

  it('allows accept only from awaiting_restaurant', () => {
    expect(
      isLegalRestaurantKitchenAction(
        {
          status: 'payment_confirmed',
          paymentStatus: 'paid',
          deliveryStatus: 'pending',
        },
        'accept',
      ),
    ).toBe(true);
    expect(
      isLegalRestaurantKitchenAction(
        {
          status: 'accepted',
          paymentStatus: 'paid',
          deliveryStatus: 'accepted',
          acceptedAtMs: 1,
        },
        'preparing',
      ),
    ).toBe(true);
    expect(
      isLegalRestaurantKitchenAction(
        {
          status: 'accepted',
          paymentStatus: 'paid',
          deliveryStatus: 'accepted',
          acceptedAtMs: 1,
        },
        'accept',
      ),
    ).toBe(false);
  });

  it('optimistic preparing sets preparedAtMs', () => {
    const patch = optimisticRestaurantOrderPatch('preparing');
    expect(patch.status).toBe('preparing');
    expect(patch.preparedAtMs).toBeGreaterThan(0);
  });
});
