import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

const integrationDescribe =
  process.env.FIRESTORE_EMULATOR_HOST != null ||
  process.env.RUN_FIRESTORE_RULES_TESTS === '1'
    ? describe
    : describe.skip;

let testEnv: RulesTestEnvironment | undefined;

function te(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error('Rules test environment not initialized');
  }
  return testEnv;
}

const activeShare = {
  foodName: 'Margherita Pizza',
  restaurantName: 'HalfOrder',
  image: 'https://example.com/pizza.jpg',
  originalPrice: 24,
  sharedPrice: 12,
  deliveryShare: 4,
  description: 'Share a pizza',
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

const inactiveShare = {
  ...activeShare,
  foodName: 'Inactive Burger',
  active: false,
};

integrationDescribe('firestore rules: adminFoodShares swipe catalog', () => {
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
    await te().clearFirestore();
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'admin1'), { role: 'admin' });
      await setDoc(doc(db, 'users', 'user1'), { role: 'user' });
      await setDoc(doc(db, 'adminFoodShares', '1'), activeShare);
      await setDoc(doc(db, 'adminFoodShares', '2'), inactiveShare);
    });
  });

  it('allows signed-in user to query active admin food shares (swipe deck)', async () => {
    const db = te().authenticatedContext('user1').firestore();
    const q = query(
      collection(db, 'adminFoodShares'),
      where('active', '==', true),
      limit(10),
    );
    await assertSucceeds(getDocs(q));
  });

  it('denies unauthenticated swipe query', async () => {
    const db = te().unauthenticatedContext().firestore();
    const q = query(
      collection(db, 'adminFoodShares'),
      where('active', '==', true),
      limit(10),
    );
    await assertFails(getDocs(q));
  });

  it('allows admin to read inactive slot by id', async () => {
    const db = te().authenticatedContext('admin1', { email: 'admin@ourfood.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'adminFoodShares', '2')));
  });

  it('allows admin to create and update adminFoodShares slot', async () => {
    const db = te().authenticatedContext('admin1', { email: 'admin@ourfood.com' }).firestore();
    const slotRef = doc(db, 'adminFoodShares', '3');
    await assertSucceeds(
      setDoc(slotRef, {
        foodName: 'New Bowl',
        restaurantName: 'HalfOrder',
        image: 'https://example.com/bowl.jpg',
        originalPrice: 18,
        sharedPrice: 9,
        deliveryShare: 3,
        description: 'Fresh bowl',
        active: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(
        slotRef,
        {
          foodName: 'Updated Bowl',
          active: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });

  it('denies non-admin write to adminFoodShares', async () => {
    const db = te().authenticatedContext('user1').firestore();
    await assertFails(
      setDoc(doc(db, 'adminFoodShares', '3'), {
        foodName: 'Hack',
        restaurantName: 'HalfOrder',
        image: 'https://example.com/x.jpg',
        originalPrice: 1,
        sharedPrice: 1,
        deliveryShare: 0,
        description: '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
