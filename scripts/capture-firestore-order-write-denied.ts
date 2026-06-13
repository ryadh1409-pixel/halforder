/**
 * Reproduce [FIRESTORE ORDER WRITE DENIED] for a specific order by running
 * protectedUpdateOrder against mocked Firestore that throws permission-denied.
 * Prints the raw JSON object passed to console.error.
 */
import { FieldValue } from 'firebase-admin/firestore';

const ORDER_ID = process.argv[2]?.trim() || 'LWbcKKwqud83ufJICXnZ';

type CapturedLog = {
  tag: string;
  payload: unknown;
};

const captured: CapturedLog[] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('FIRESTORE ORDER WRITE DENIED')) {
    captured.push({ tag: String(args[0]), payload: args[1] });
  }
  originalError(...args);
};

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

async function main(): Promise<void> {
  const { protectedUpdateOrder } = await import('../services/orderFirestoreWrite');

  const firebaseAuth = await import('../services/firebase');
  Object.defineProperty(firebaseAuth, 'auth', {
    value: { currentUser: { uid: 'anI1ll3hT8clTNoeAT8iimL9Oj83' } },
    writable: true,
    configurable: true,
  });

  const firestore = await import('firebase/firestore');
  const originalGetDoc = firestore.getDoc;
  const originalUpdateDoc = firestore.updateDoc;
  const originalDoc = firestore.doc;

  (firestore as { getDoc: typeof firestore.getDoc }).getDoc = async () =>
    ({
      exists: () => true,
      data: () => orderAtDenialTime,
    }) as Awaited<ReturnType<typeof firestore.getDoc>>;

  (firestore as { updateDoc: typeof firestore.updateDoc }).updateDoc = async () => {
    throw permissionDeniedError;
  };

  (firestore as { doc: typeof firestore.doc }).doc = (...args: unknown[]) =>
    originalDoc(...(args as Parameters<typeof originalDoc>));

  const kitchenPatch = {
    status: 'accepted',
    deliveryStatus: 'accepted',
    updatedBy: 'restaurantAccept',
    acceptedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    estimatedDeliveryTime: 35,
  };

  let thrown: unknown = null;
  try {
    await protectedUpdateOrder(ORDER_ID, kitchenPatch as Record<string, unknown>, {
      fileName: 'orderService.ts',
      functionName: 'applyProtectedOrderPatch',
    });
  } catch (error) {
    thrown = error;
  }

  process.stdout.write('\n=== CAPTURED console.error PAYLOADS ===\n');
  if (captured.length === 0) {
    process.stdout.write('NONE\n');
  } else {
    for (const entry of captured) {
      process.stdout.write(`${entry.tag}\n`);
      process.stdout.write(`${JSON.stringify(entry.payload, null, 2)}\n`);
    }
  }

  process.stdout.write('\n=== THROWN FIRESTORE ERROR (not in console.error object) ===\n');
  if (thrown && typeof thrown === 'object' && thrown !== null) {
    const err = thrown as { code?: string; message?: string; name?: string; stack?: string };
    process.stdout.write(
      `${JSON.stringify(
        {
          code: err.code ?? null,
          message: err.message ?? null,
          name: err.name ?? null,
          fullError: {
            code: err.code,
            message: err.message,
            name: err.name,
          },
        },
        null,
        2,
      )}\n`,
    );
  }

  (firestore as { getDoc: typeof firestore.getDoc }).getDoc = originalGetDoc;
  (firestore as { updateDoc: typeof firestore.updateDoc }).updateDoc = originalUpdateDoc;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
