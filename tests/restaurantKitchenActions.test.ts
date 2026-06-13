jest.mock('@/services/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

jest.mock('@/services/orderService', () => ({
  applyProtectedOrderPatch: jest.fn(),
}));

jest.mock('@/lib/orderListenerCommit', () => ({
  clearOrderListenerCommitCache: jest.fn(),
}));

jest.mock('@/lib/orderStageLock', () => ({
  lockOrderStage: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
}));

import { buildRestaurantKitchenPatch } from '@/lib/restaurantKitchenActions';

describe('restaurantKitchenActions patches', () => {
  it('accept writes status=accepted and deliveryStatus=accepted with updatedBy', () => {
    const patch = buildRestaurantKitchenPatch('accept');
    expect(patch.status).toBe('accepted');
    expect(patch.deliveryStatus).toBe('accepted');
    expect(patch.updatedBy).toBe('restaurantAccept');
    expect(patch.acceptedAt).toBeDefined();
  });

  it('preparing writes status=preparing and deliveryStatus=preparing with updatedBy', () => {
    const patch = buildRestaurantKitchenPatch('preparing');
    expect(patch.status).toBe('preparing');
    expect(patch.deliveryStatus).toBe('preparing');
    expect(patch.updatedBy).toBe('restaurantPreparing');
    expect(patch.preparedAt).toBeDefined();
  });

  it('ready writes status=ready_for_pickup and deliveryStatus=ready_for_pickup with updatedBy', () => {
    const patch = buildRestaurantKitchenPatch('ready');
    expect(patch.status).toBe('ready_for_pickup');
    expect(patch.deliveryStatus).toBe('ready_for_pickup');
    expect(patch.updatedBy).toBe('restaurantReady');
    expect(patch.readyAt).toBeDefined();
  });
});
