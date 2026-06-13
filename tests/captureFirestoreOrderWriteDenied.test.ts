/**
 * Captures the exact [FIRESTORE ORDER WRITE DENIED] console.error payload.
 */
const ORDER_ID = 'LWbcKKwqud83ufJICXnZ';

const permissionDeniedError = Object.assign(new Error('Missing or insufficient permissions.'), {
  code: 'permission-denied',
  name: 'FirebaseError',
});

const orderAtDenialTime = {
  restaurantId: 'anI1ll3hT8clTNoeAT8iimL9Oj83',
  venueId: 'anI1ll3hT8clTNoeAT8iimL9Oj83',
  userId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
  customerId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
  paymentStatus: 'paid',
  status: 'payment_confirmed',
  deliveryStatus: 'pending',
  deliveryType: 'delivery',
  totalPrice: 14.3849,
  items: [{ id: 'Bx4mwZ6P5szgnGMsgBHt', name: 'ottawa food', price: 10, qty: 1 }],
};

jest.mock('@/services/firebase', () => ({
  auth: { currentUser: { uid: 'anI1ll3hT8clTNoeAT8iimL9Oj83' } },
  db: {},
}));

const mockGetDoc = jest.fn();
const mockUpdateDoc = jest.fn();
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: `orders/${ORDER_ID}` })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  collection: jest.fn(),
  addDoc: jest.fn(),
  setDoc: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
}));

import { protectedUpdateOrder } from '@/services/orderFirestoreWrite';

describe('capture [FIRESTORE ORDER WRITE DENIED] payload', () => {
  it('prints raw JSON for LWbcKKwqud83ufJICXnZ restaurant accept denial', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => orderAtDenialTime,
    });
    mockUpdateDoc.mockRejectedValue(permissionDeniedError);

    const captured: unknown[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('FIRESTORE ORDER WRITE DENIED')) {
        captured.push(args[1]);
      }
    });

    let thrown: unknown = null;
    try {
      await protectedUpdateOrder(
        ORDER_ID,
        {
          status: 'accepted',
          deliveryStatus: 'accepted',
          updatedBy: 'restaurantAccept',
          acceptedAt: { _methodName: 'serverTimestamp' },
          updatedAt: { _methodName: 'serverTimestamp' },
          estimatedDeliveryTime: 35,
        },
        { fileName: 'orderService.ts', functionName: 'applyProtectedOrderPatch' },
      );
    } catch (error) {
      thrown = error;
    }

    spy.mockRestore();

    expect(captured).toHaveLength(1);
    // eslint-disable-next-line no-console
    console.log('\n=== RAW console.error JSON OBJECT ===');
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(captured[0], null, 2));
    // eslint-disable-next-line no-console
    console.log('\n=== THROWN ERROR (separate from console.error object) ===');
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          code: (thrown as { code?: string })?.code ?? null,
          message: (thrown as { message?: string })?.message ?? null,
          name: (thrown as { name?: string })?.name ?? null,
        },
        null,
        2,
      ),
    );
  });
});
