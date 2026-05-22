import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

/** Run with: `RUN_FIRESTORE_RULES_TESTS=1 firebase emulators:exec --only firestore -- npm test` */
const integrationDescribe =
  process.env.FIRESTORE_EMULATOR_HOST != null ||
  process.env.RUN_FIRESTORE_RULES_TESTS === '1'
    ? describe
    : describe.skip;

let testEnv: RulesTestEnvironment | undefined;

function te(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error(
      'Rules test environment not initialized (is the Firestore emulator on 127.0.0.1:8080?)',
    );
  }
  return testEnv;
}

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

integrationDescribe('firestore rules (Firestore emulator)', () => {
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
  });

  describe('firestore rules: orders create + participants join', () => {
    it('allows marketplace delivery order create with required fields', async () => {
      const db = te().authenticatedContext('cust1').firestore();
      await assertSucceeds(
        setDoc(doc(db, 'orders', 'mkt1'), {
          userId: 'cust1',
          customerId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
          totalPrice: 12,
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('denies marketplace order create when userId does not match auth', async () => {
      const db = te().authenticatedContext('cust1').firestore();
      await assertFails(
        setDoc(doc(db, 'orders', 'mkt2'), {
          userId: 'other_user',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('denies marketplace order create without paymentStatus', async () => {
      const db = te().authenticatedContext('cust1').firestore();
      await assertFails(
        setDoc(doc(db, 'orders', 'mkt3'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          deliveryType: 'delivery',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows marketplace create when user has activeOrderCount (checkout retry)', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'cust1'), {
          totalOrdersCompleted: 0,
          activeOrderCount: 2,
        });
      });
      const db = te().authenticatedContext('cust1').firestore();
      await assertSucceeds(
        addDoc(collection(db, 'orders'), {
          userId: 'cust1',
          customerId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
          totalPrice: 12,
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows marketplace pickup order create', async () => {
      const db = te().authenticatedContext('cust1').firestore();
      await assertSucceeds(
        setDoc(doc(db, 'orders', 'mkt_pickup'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'pickup',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows marketplace order create for restaurant role (owner uid match)', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'host1'), { role: 'restaurant' });
      });
      const db = te().authenticatedContext('host1').firestore();
      await assertSucceeds(
        addDoc(collection(db, 'orders'), {
          userId: 'host1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('denies marketplace order create for driver role', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'drv1'), { role: 'driver' });
      });
      const db = te().authenticatedContext('drv1').firestore();
      await assertFails(
        addDoc(collection(db, 'orders'), {
          userId: 'drv1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('denies marketplace create with paid paymentStatus', async () => {
      const db = te().authenticatedContext('cust1').firestore();
      await assertFails(
        setDoc(doc(db, 'orders', 'mkt_paid'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'paid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows customer to read own marketplace order', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'mkt4'), {
          userId: 'cust1',
          customerId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          totalPrice: 20,
          createdAt: serverTimestamp(),
        });
      });
      const db = te().authenticatedContext('cust1').firestore();
      await assertSucceeds(getDoc(doc(db, 'orders', 'mkt4')));
    });

    it('denies other users from reading marketplace order', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'mkt5'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          paymentStatus: 'unpaid',
          deliveryType: 'delivery',
          status: 'awaiting_payment',
          createdAt: serverTimestamp(),
        });
      });
      const db = te().authenticatedContext('cust2').firestore();
      await assertFails(getDoc(doc(db, 'orders', 'mkt5')));
    });

    it('allows valid order create by owner', async () => {
      const db = te().authenticatedContext('u1').firestore();
      await assertSucceeds(
        setDoc(doc(db, 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u1'],
          joinedAtMap: { u1: serverTimestamp() },
        }),
      );
    });

    it('denies create when creator is not in participants', async () => {
      const db = te().authenticatedContext('u1').firestore();
      await assertFails(
        setDoc(doc(db, 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u2'],
          joinedAtMap: { u2: serverTimestamp() },
        }),
      );
    });

    it('allows one valid join update (+1 participant and joinedAtMap for joiner)', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u1'],
          joinedAtMap: { u1: serverTimestamp() },
        });
      });

      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertSucceeds(
        updateDoc(doc(dbU2, 'orders', 'o1'), {
          participants: arrayUnion('u2'),
          'joinedAtMap.u2': serverTimestamp(),
        }),
      );
    });

    it('denies duplicate join by same user', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u1'],
          joinedAtMap: { u1: serverTimestamp() },
          maxPeople: 3,
        });
      });

      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertFails(
        updateDoc(doc(dbU1, 'orders', 'o1'), {
          participants: arrayUnion('u1'),
          'joinedAtMap.u1': serverTimestamp(),
        }),
      );
    });

    it('denies overfill when participants would exceed maxPeople', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
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

      const dbU3 = te().authenticatedContext('u3').firestore();
      await assertFails(
        updateDoc(doc(dbU3, 'orders', 'o1'), {
          participants: arrayUnion('u3'),
          'joinedAtMap.u3': serverTimestamp(),
        }),
      );
    });

    it('denies changing unrelated fields during join update', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u1'],
          joinedAtMap: { u1: serverTimestamp() },
          maxPeople: 3,
        });
      });

      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertFails(
        updateDoc(doc(dbU2, 'orders', 'o1'), {
          participants: arrayUnion('u2'),
          'joinedAtMap.u2': serverTimestamp(),
          foodName: 'Changed',
        }),
      );
    });

    it('creator can still perform non-join update', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'o1'), {
          ...baseOrderFields('u1'),
          participants: ['u1'],
          joinedAtMap: { u1: serverTimestamp() },
          maxPeople: 3,
        });
      });
      const dbU1 = te().authenticatedContext('u1').firestore();
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
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
          foodName: 'Swipe Pizza',
          image: 'https://example.com/p.jpg',
          totalPrice: 24,
          maxPeople: 2,
          status: 'open',
          usersAccepted: [],
          createdAt: serverTimestamp(),
        });
      });

      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertSucceeds(
        updateDoc(doc(dbU1, 'orders', 'sw1'), {
          usersAccepted: arrayUnion('u1'),
        }),
      );
    });

    it('allows a second user to like, then either user can create a match doc', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
          foodName: 'Swipe Pizza',
          image: 'https://example.com/p.jpg',
          totalPrice: 24,
          maxPeople: 2,
          status: 'open',
          usersAccepted: ['u1', 'u2'],
          createdAt: serverTimestamp(),
        });
      });

      const dbU1 = te().authenticatedContext('u1').firestore();
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
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'sw1'), {
          foodName: 'Swipe Pizza',
          image: 'https://example.com/p.jpg',
          totalPrice: 24,
          maxPeople: 2,
          status: 'open',
          usersAccepted: ['u1', 'u2'],
          createdAt: serverTimestamp(),
        });
      });

      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertFails(
        setDoc(doc(dbU1, 'matches', 'wrong-id'), {
          orderId: 'sw1',
          users: ['u1', 'u2'],
          status: 'matched',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows a user to persist their own swipe gesture only', async () => {
      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertSucceeds(
        addDoc(collection(dbU1, 'swipes'), {
          userId: 'u1',
          orderId: 'sw1',
          foodId: 'food1',
          restaurantId: 'rest1',
          direction: 'like',
          liked: true,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        }),
      );

      await assertFails(
        addDoc(collection(dbU1, 'swipes'), {
          userId: 'u2',
          orderId: 'sw1',
          foodId: 'food1',
          restaurantId: 'rest1',
          direction: 'like',
          liked: true,
          timestamp: serverTimestamp(),
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('allows matched participants to create and read a shared order room', async () => {
      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertSucceeds(
        setDoc(doc(dbU1, 'sharedOrders', 'sw1_u1_u2'), {
          orderId: 'sw1',
          matchId: 'sw1_u1_u2',
          participantIds: ['u1', 'u2'],
          foodTitle: 'Swipe Pizza',
          restaurantName: 'Queen St Kitchen',
          heroImageUri: 'https://example.com/p.jpg',
          splitPrice: 12,
          cartSubtotal: 24,
          cartItems: [
            {
              id: 'sw1',
              title: 'Swipe Pizza',
              quantity: 2,
              pricePerPerson: 12,
              total: 24,
            },
          ],
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );

      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertSucceeds(getDoc(doc(dbU2, 'sharedOrders', 'sw1_u1_u2')));

      const dbU3 = te().authenticatedContext('u3').firestore();
      await assertFails(getDoc(doc(dbU3, 'sharedOrders', 'sw1_u1_u2')));
    });
  });

  describe('firestore rules: HalfOrder pair-join notified ack', () => {
    function halfOrderPairDoc() {
      const ts = serverTimestamp();
      return {
        cardId: 'fc1',
        users: ['u1', 'u2'],
        host: {
          userId: 'u1',
          name: 'User One',
          avatar: null,
          phone: null,
          expoPushToken: null,
        },
        participants: ['u1', 'u2'],
        joinedAtMap: { u1: ts, u2: ts },
        status: 'active' as const,
        maxUsers: 2,
        createdBy: 'u1',
        hostId: 'u1',
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
        location: 'Here',
      };
    }

    it('allows an order member to set notified once', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), halfOrderPairDoc());
      });
      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertSucceeds(
        updateDoc(doc(dbU2, 'orders', 'ho1'), {
          notified: true,
          notifiedAt: serverTimestamp(),
        }),
      );
    });

    it('denies duplicate notified when already true', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), {
          ...halfOrderPairDoc(),
          notified: true,
          notifiedAt: serverTimestamp(),
        });
      });
      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertFails(
        updateDoc(doc(dbU2, 'orders', 'ho1'), {
          notified: true,
          notifiedAt: serverTimestamp(),
        }),
      );
    });

    it('denies notified ack when caller is not in users', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'ho1'), halfOrderPairDoc());
      });
      const dbU3 = te().authenticatedContext('u3').firestore();
      await assertFails(
        updateDoc(doc(dbU3, 'orders', 'ho1'), {
          notified: true,
          notifiedAt: serverTimestamp(),
        }),
      );
    });
  });

  describe('firestore rules: HalfOrder cancel + order_members', () => {
    function halfOrderActivePair() {
      const ts = serverTimestamp();
      return {
        cardId: 'fc2',
        users: ['u1', 'u2'],
        host: {
          userId: 'u1',
          name: 'User One',
          avatar: null,
          phone: null,
          expoPushToken: null,
        },
        participants: ['u1', 'u2'],
        joinedAtMap: { u1: ts, u2: ts },
        status: 'active' as const,
        maxUsers: 2,
        createdBy: 'u1',
        hostId: 'u1',
        createdAt: serverTimestamp(),
        foodName: 'Pizza',
        image: 'https://example.com/p.jpg',
        pricePerPerson: 5,
        totalPrice: 10,
        location: 'Here',
      };
    }

    it('allows a member to cancel a HalfOrder with cancelledBy + cancelledAt', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'orders', 'ho2'),
          halfOrderActivePair(),
        );
      });
      const dbU2 = te().authenticatedContext('u2').firestore();
      await assertSucceeds(
        updateDoc(doc(dbU2, 'orders', 'ho2'), {
          status: 'cancelled',
          cancelledBy: 'u2',
          cancelledAt: serverTimestamp(),
        }),
      );
    });

    it('denies cancel when cancelledBy does not match caller', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'orders', 'ho3'),
          halfOrderActivePair(),
        );
      });
      const dbU3 = te().authenticatedContext('u3').firestore();
      await assertFails(
        updateDoc(doc(dbU3, 'orders', 'ho3'), {
          status: 'cancelled',
          cancelledBy: 'u2',
          cancelledAt: serverTimestamp(),
        }),
      );
    });

    it('allows order member to upsert their order_members profile', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'ho4'), {
          ...halfOrderActivePair(),
          users: ['u1', 'u2'],
        });
      });
      const dbU1 = te().authenticatedContext('u1').firestore();
      await assertSucceeds(
        setDoc(doc(dbU1, 'orders', 'ho4', 'order_members', 'u1'), {
          userId: 'u1',
          name: 'Alice',
          avatar: null,
          phone: null,
          pushToken: null,
          joinedAt: Timestamp.now(),
          location: { lat: 1, lng: 2 },
        }),
      );
    });

    it('allows driver_marketplace_pool list for driver account doc', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'drivers', 'drv1'), {
          name: 'Driver One',
          isOnline: true,
        });
        await setDoc(doc(ctx.firestore(), 'driver_marketplace_pool', 'pool1'), {
          orderId: 'pool1',
          status: 'pending_driver',
          deliveryType: 'delivery',
          driverId: null,
          assignedDriverId: null,
          createdAt: Timestamp.now(),
        });
      });
      const db = te().authenticatedContext('drv1').firestore();
      await assertSucceeds(
        getDocs(
          query(collection(db, 'driver_marketplace_pool'), orderBy('createdAt', 'desc')),
        ),
      );
    });

    it('allows driver marketplace pool list when auth token role is driver', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'drv1'), { role: 'driver' });
        await setDoc(doc(ctx.firestore(), 'orders', 'pool1'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          venueId: 'rest_abc',
          status: 'pending_driver',
          deliveryType: 'delivery',
          driverId: null,
          assignedDriverId: null,
          createdAt: Timestamp.now(),
        });
      });
      const db = te().authenticatedContext('drv1', { role: 'driver' }).firestore();
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'orders'),
            where('status', '==', 'pending_driver'),
            where('deliveryType', '==', 'delivery'),
            where('driverId', '==', null),
            where('assignedDriverId', '==', null),
            orderBy('createdAt', 'desc'),
          ),
        ),
      );
    });

    it('denies marketplace pool list for customer role token', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'pool2'), {
          userId: 'cust1',
          restaurantId: 'rest_abc',
          status: 'pending_driver',
          deliveryType: 'delivery',
          driverId: null,
          assignedDriverId: null,
          createdAt: Timestamp.now(),
        });
      });
      const db = te().authenticatedContext('cust1', { role: 'user' }).firestore();
      await assertFails(
        getDocs(
          query(
            collection(db, 'orders'),
            where('status', '==', 'pending_driver'),
            where('deliveryType', '==', 'delivery'),
            where('driverId', '==', null),
            where('assignedDriverId', '==', null),
            orderBy('createdAt', 'desc'),
          ),
        ),
      );
    });

    it('denies order_members write for non-member', async () => {
      await te().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'orders', 'ho5'), {
          ...halfOrderActivePair(),
          users: ['u1', 'u2'],
        });
      });
      const dbU3 = te().authenticatedContext('u3').firestore();
      await assertFails(
        setDoc(doc(dbU3, 'orders', 'ho5', 'order_members', 'u3'), {
          userId: 'u3',
          name: 'Eve',
          avatar: null,
          phone: null,
          pushToken: null,
          joinedAt: Timestamp.now(),
          location: null,
        }),
      );
    });
  });
});
