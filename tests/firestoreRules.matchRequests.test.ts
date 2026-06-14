import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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
  foodName: 'Test Pizza',
  restaurantName: 'HalfOrder',
  image: 'https://example.com/pizza.jpg',
  originalPrice: 20,
  sharedPrice: 10,
  deliveryShare: 2,
  description: 'Test',
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

integrationDescribe('firestore rules: matchRequests food share flow', () => {
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
      await setDoc(doc(db, 'users', 'userA'), { role: 'user' });
      await setDoc(doc(db, 'users', 'userB'), { role: 'user' });
      await setDoc(doc(db, 'users', 'admin1'), { role: 'admin' });
      await setDoc(doc(db, 'adminFoodShares', '1'), activeShare);
    });
  });

  it('allows get on non-existent own matchRequest doc (transaction pre-read)', async () => {
    const db = te().authenticatedContext('userA').firestore();
    await assertSucceeds(getDoc(doc(db, 'matchRequests', '1_userA')));
  });

  it('allows user to create own WAITING matchRequest', async () => {
    const db = te().authenticatedContext('userA').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        userFirstName: 'Alice',
        status: 'WAITING',
        matchId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows user to read own matchRequest', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        status: 'WAITING',
        createdAt: serverTimestamp(),
      });
    });
    const db = te().authenticatedContext('userA').firestore();
    await assertSucceeds(getDoc(doc(db, 'matchRequests', '1_userA')));
  });

  it('denies user reading another users matchRequest', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        status: 'WAITING',
        createdAt: serverTimestamp(),
      });
    });
    const db = te().authenticatedContext('userB').firestore();
    await assertFails(getDoc(doc(db, 'matchRequests', '1_userA')));
  });

  it('allows admin to read any matchRequest', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        status: 'WAITING',
        createdAt: serverTimestamp(),
      });
    });
    const db = te()
      .authenticatedContext('admin1', { email: 'admin@ourfood.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(db, 'matchRequests', '1_userA')));
  });

  it('allows matcher to create partner MATCHED request when partner doc missing', async () => {
    const db = te().authenticatedContext('userB').firestore();
    const matchId = '1_userA_userB';
    await assertSucceeds(
      setDoc(
        doc(db, 'matchRequests', '1_userA'),
        {
          adminFoodShareId: '1',
          userId: 'userA',
          userFirstName: 'Alice',
          status: 'MATCHED',
          matchId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });

  it('allows matcher to update partner WAITING to MATCHED', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        status: 'WAITING',
        createdAt: serverTimestamp(),
      });
    });
    const db = te().authenticatedContext('userB').firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'matchRequests', '1_userA'),
        {
          adminFoodShareId: '1',
          userId: 'userA',
          status: 'MATCHED',
          matchId: '1_userA_userB',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    );
  });

  it('allows user to create own MATCHED matchRequest', async () => {
    const db = te().authenticatedContext('userB').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'matchRequests', '1_userB'), {
        adminFoodShareId: '1',
        userId: 'userB',
        userFirstName: 'Bob',
        status: 'MATCHED',
        matchId: '1_userA_userB',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('allows CANCELLED own request to become WAITING again', async () => {
    await te().withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        status: 'CANCELLED',
        createdAt: serverTimestamp(),
      });
    });
    const db = te().authenticatedContext('userA').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'matchRequests', '1_userA'), {
        adminFoodShareId: '1',
        userId: 'userA',
        userFirstName: 'Alice',
        status: 'WAITING',
        matchId: null,
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
