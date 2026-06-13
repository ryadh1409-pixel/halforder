/**
 * Real Firestore rules emulator write against order LWbcKKwqud83ufJICXnZ state.
 * Run: npx tsx scripts/trace-lwbc-rules-denial.ts
 * Requires: firebase emulators:exec --only firestore -- npx tsx scripts/trace-lwbc-rules-denial.ts
 */
import { readFileSync } from 'node:fs';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const ORDER_ID = 'LWbcKKwqud83ufJICXnZ';
const ACTOR_UID = 'anI1ll3hT8clTNoeAT8iimL9Oj83';
const RESTAURANT_ID = 'anI1ll3hT8clTNoeAT8iimL9Oj83';

async function main() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'demo-lwbc-trace',
    firestore: {
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080),
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ACTOR_UID), {
      role: 'restaurant',
      restaurantId: RESTAURANT_ID,
    });
    await setDoc(doc(ctx.firestore(), 'restaurants', RESTAURANT_ID), {
      ownerId: ACTOR_UID,
      name: 'Thmori',
    });
    await setDoc(doc(ctx.firestore(), 'orders', ORDER_ID), {
      userId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
      customerId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
      restaurantId: RESTAURANT_ID,
      venueId: RESTAURANT_ID,
      deliveryType: 'delivery',
      paymentStatus: 'paid',
      status: 'driver_assigned',
      deliveryStatus: 'ready_for_pickup',
      driverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      assignedDriverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      driverName: 'Tkal',
      totalPrice: 14.3849,
      total: 14.3849,
      subtotal: 14.3849,
      items: [{ id: 'Bx4mwZ6P5szgnGMsgBHt', name: 'ottawa food', price: 10, qty: 1 }],
      hiddenForRestaurant: false,
      archivedByRestaurant: false,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: 'driverService.ts#claimMarketplaceDriverOrder',
    });
  });

  const db = testEnv.authenticatedContext(ACTOR_UID).firestore();

  const readyPatch = {
    status: 'ready_for_pickup',
    deliveryStatus: 'ready_for_pickup',
    updatedBy: 'restaurantReady',
    preparedAt: serverTimestamp(),
    readyAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    estimatedDeliveryTime: 35,
  };

  console.log('=== REAL EMULATOR WRITE (restaurant ready patch on driver_assigned doc) ===');
  console.log(JSON.stringify({
    documentPath: `orders/${ORDER_ID}`,
    actorUid: ACTOR_UID,
    actorRole: 'restaurant',
    restaurantId: RESTAURANT_ID,
    ownerId: ACTOR_UID,
    driverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
    assignedDriverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
    before: { status: 'driver_assigned', deliveryStatus: 'ready_for_pickup' },
    requestedPatch: readyPatch,
  }, null, 2));

  await assertFails(updateDoc(doc(db, 'orders', ORDER_ID), readyPatch));
  console.log('RESULT: permission-denied (assertFails passed)');

  await testEnv.cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
