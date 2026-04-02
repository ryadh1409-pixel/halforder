/**
 * Integration test: order create + join flow (Firestore rules + emulator).
 * Start emulator: firebase emulators:start --only firestore
 * Then: npm test
 */
import { readFileSync } from 'node:fs';

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

const userA = 'user-a-test-' + Date.now();
const userB = 'user-b-test-' + Date.now();

let testEnv: RulesTestEnvironment | undefined;

async function joinOrderWithTransaction(
  firestore: Firestore,
  orderId: string,
  user: { uid: string },
): Promise<void> {
  if (!user?.uid) {
    throw new Error('You must be signed in to join.');
  }
  const orderRef = doc(firestore, 'orders', orderId);
  await runTransaction(firestore, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error('Order not found');
    }
    const orderData = orderSnap.data();
    if (orderData.status !== 'open') {
      throw new Error('Order is not open');
    }
    const participants: string[] = Array.isArray(orderData.participants)
      ? orderData.participants.filter((x): x is string => typeof x === 'string')
      : [];
    const maxPeople = Number(orderData.maxPeople ?? 0);
    if (participants.includes(user.uid)) {
      throw new Error('You already joined this order');
    }
    if (participants.length >= maxPeople) {
      throw new Error('Order is full');
    }
    transaction.update(orderRef, {
      participants: arrayUnion(user.uid),
      [`joinedAtMap.${user.uid}`]: serverTimestamp(),
    });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

const EMULATOR_TIMEOUT_MS = 8000;

describe('order flow integration', () => {
  it(
    'creates order as User A, User B joins, participants length 2 and status stays open',
    async () => {
      const dbA = testEnv.authenticatedContext(userA).firestore();
      const ordersRef = collection(dbA, 'orders');
      const orderData = {
        status: 'open',
        foodName: 'Test Meal',
        image: 'https://example.com/t.jpg',
        pricePerPerson: 10,
        totalPrice: 30,
        usersAccepted: [] as string[],
        participants: [userA],
        joinedAtMap: { [userA]: serverTimestamp() },
        maxPeople: 3,
        createdBy: userA,
        createdAt: serverTimestamp(),
        restaurantName: 'Test Restaurant',
      };

      let orderId: string;
      try {
        const ref = await Promise.race([
          addDoc(ordersRef, orderData),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    'Firestore emulator not running. Start with: firebase emulators:start --only firestore',
                  ),
                ),
              EMULATOR_TIMEOUT_MS,
            ),
          ),
        ]);
        orderId = ref.id;
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'Failed to create order';
        if (msg.includes('emulator')) throw e;
        throw new Error(
          `${msg}. (Ensure emulator is running: firebase emulators:start --only firestore)`,
        );
      }

      const orderSnap = await getDoc(doc(dbA, 'orders', orderId));
      if (!orderSnap.exists()) {
        throw new Error('Order was not created');
      }
      const created = orderSnap.data();
      expect(created.status).toBe('open');
      expect(Array.isArray(created.participants)).toBe(true);
      expect(created.participants).toContain(userA);
      expect(created.participants.length).toBe(1);
      expect(created.maxPeople).toBe(3);

      const dbB = testEnv.authenticatedContext(userB).firestore();
      await joinOrderWithTransaction(dbB, orderId, { uid: userB });

      const afterSnap = await getDoc(doc(dbB, 'orders', orderId));
      if (!afterSnap.exists()) {
        throw new Error('Order missing after join');
      }
      const after = afterSnap.data();
      expect(after.participants.length).toBe(2);
      expect(after.participants).toContain(userA);
      expect(after.participants).toContain(userB);
      expect(after.status).toBe('open');

      console.log(
        '\n  ✓ Order flow test passed: create (open) -> join -> 2 participants, status open.\n',
      );
    },
    EMULATOR_TIMEOUT_MS + 4000,
  );
});
