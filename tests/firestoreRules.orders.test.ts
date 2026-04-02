import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment | undefined;

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

function baseOrderFields(createdByUid: string) {
  return {
    id: 'o1',
    foodName: 'Pepperoni Pizza',
    image: 'https://example.com/pizza.jpg',
    pricePerPerson: 10,
    totalPrice: 30,
    maxPeople: 3,
    usersAccepted: [] as string[],
    createdBy: createdByUid,
    createdAt: serverTimestamp(),
  };
}

describe('firestore rules: orders create + participants join', () => {
  it('allows valid order create by owner', async () => {
    const db = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
      }),
    );
  });

  it('denies create when creator is not in participants', async () => {
    const db = testEnv.authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(db, 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u2'],
        joinedAtMap: { u2: serverTimestamp() },
      }),
    );
  });

  it('allows one valid join update (+1 participant and joinedAtMap for joiner)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
      });
    });

    const dbU2 = testEnv.authenticatedContext('u2').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        participants: arrayUnion('u2'),
        'joinedAtMap.u2': serverTimestamp(),
      }),
    );
  });

  it('denies duplicate join by same user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });

    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertFails(
      updateDoc(doc(dbU1, 'orders', 'o1'), {
        participants: arrayUnion('u1'),
        'joinedAtMap.u1': serverTimestamp(),
      }),
    );
  });

  it('denies overfill when participants would exceed maxPeople', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1', 'u2'],
        joinedAtMap: {
          u1: serverTimestamp(),
          u2: serverTimestamp(),
        },
        maxPeople: 2,
      });
    });

    const dbU3 = testEnv.authenticatedContext('u3').firestore();
    await assertFails(
      updateDoc(doc(dbU3, 'orders', 'o1'), {
        participants: arrayUnion('u3'),
        'joinedAtMap.u3': serverTimestamp(),
      }),
    );
  });

  it('denies changing unrelated fields during join update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });

    const dbU2 = testEnv.authenticatedContext('u2').firestore();
    await assertFails(
      updateDoc(doc(dbU2, 'orders', 'o1'), {
        participants: arrayUnion('u2'),
        'joinedAtMap.u2': serverTimestamp(),
        foodName: 'Changed',
      }),
    );
  });

  it('creator can still perform non-join update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
        ...baseOrderFields('u1'),
        participants: ['u1'],
        joinedAtMap: { u1: serverTimestamp() },
        maxPeople: 3,
      });
    });
    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU1, 'orders', 'o1'), {
        image: 'https://example.com/new.jpg',
      }),
    );
    const snap = await getDoc(doc(dbU1, 'orders', 'o1'));
    expect(snap.data()?.image).toBe('https://example.com/new.jpg');
  });
});

describe('firestore rules: swipe usersAccepted + food matches', () => {
  it('allows a signed-in user to add themselves once to usersAccepted', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: [],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(
      updateDoc(doc(dbU1, 'orders', 'sw1'), {
        usersAccepted: arrayUnion('u1'),
      }),
    );
  });

  it('allows a second user to like, then either user can create a match doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: ['u1', 'u2'],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertSucceeds(
      setDoc(doc(dbU1, 'matches', 'sw1_u1_u2'), {
        orderId: 'sw1',
        users: ['u1', 'u2'],
        status: 'matched',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('denies match create when match id does not match canonical pattern', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
        foodName: 'Swipe Pizza',
        image: 'https://example.com/p.jpg',
        totalPrice: 24,
        maxPeople: 2,
        usersAccepted: ['u1', 'u2'],
        createdAt: serverTimestamp(),
      });
    });

    const dbU1 = testEnv.authenticatedContext('u1').firestore();
    await assertFails(
      setDoc(doc(dbU1, 'matches', 'wrong-id'), {
        orderId: 'sw1',
        users: ['u1', 'u2'],
        status: 'matched',
        createdAt: serverTimestamp(),
      }),
    );
  });
});
