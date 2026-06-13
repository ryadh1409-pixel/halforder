/**
 * Reproduce driver pickup denial for order 9PT5ur6jRTwpFHZ9nRze state.
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-pickup-trace',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'drivers', '9XN334yG4hOglrOYfsehHPDM5zP2'), { name: 'Tkal' });
    await setDoc(doc(ctx.firestore(), 'orders', '9PT5ur6jRTwpFHZ9nRze'), {
      userId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
      customerId: 'mIV6OpL6OHPeBN9EXLyamuEBTGA3',
      restaurantId: 'anI1ll3hT8clTNoeAT8iimL9Oj83',
      venueId: 'anI1ll3hT8clTNoeAT8iimL9Oj83',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      driverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      assignedDriverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      status: 'driver_assigned',
      deliveryStatus: 'driver_assigned',
      totalPrice: 14.3849,
      total: 14.3849,
      items: [{ id: 'Bx4mwZ6P5szgnGMsgBHt', name: 'ottawa food', price: 10, qty: 1 }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      acceptedAt: Timestamp.now(),
    });
  });

  const db = testEnv.authenticatedContext('9XN334yG4hOglrOYfsehHPDM5zP2').firestore();
  const patch = {
    deliveryStatus: 'picked_up',
    status: 'picked_up',
    updatedBy: 'driverMarketplacePickup',
    pickedUpAt: serverTimestamp(),
  };

  try {
    await assertSucceeds(updateDoc(doc(db, 'orders', '9PT5ur6jRTwpFHZ9nRze'), patch));
    console.log('RESULT: SUCCEEDED');
  } catch (e) {
    console.log('RESULT: FAILED (assertSucceeds threw)');
    console.log(String(e));
    try {
      await updateDoc(doc(db, 'orders', '9PT5ur6jRTwpFHZ9nRze'), patch);
    } catch (err) {
      console.log('RAW ERROR:', err);
    }
  }

  // missing deliveryType variant
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', 'no_dtype'), {
      userId: 'cust1',
      restaurantId: 'rest_abc',
      paymentStatus: 'paid',
      driverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      assignedDriverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      status: 'driver_assigned',
      deliveryStatus: 'driver_assigned',
      totalPrice: 15,
      items: [{ id: 'i1', name: 'Burger', price: 12, qty: 1 }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });

  try {
    await assertSucceeds(updateDoc(doc(db, 'orders', 'no_dtype'), patch));
    console.log('NO deliveryType: SUCCEEDED');
  } catch {
    console.log('NO deliveryType: FAILED');
  }

  await testEnv.cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
