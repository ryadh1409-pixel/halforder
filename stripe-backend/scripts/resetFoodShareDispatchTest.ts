/**
 * Delete orders + pool for a food-share match, then backfill dispatch order.
 * Usage: npx tsx stripe-backend/scripts/resetFoodShareDispatchTest.ts <matchId>
 */
import * as admin from "firebase-admin";
import {backfillFoodShareDispatchOrderIfNeeded} from "../src/foodShareDispatchOrder.js";

const matchId = process.argv[2]?.trim();
if (!matchId) {
  console.error("Usage: npx tsx stripe-backend/scripts/resetFoodShareDispatchTest.ts <matchId>");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({projectId: "halforfer"});
}

const db = admin.firestore();

async function main(): Promise<void> {
  const orderId = matchId;
  const orderRef = db.doc(`orders/${orderId}`);
  const poolRef = db.doc(`driver_marketplace_pool/${orderId}`);

  const [orderSnap, poolSnap] = await Promise.all([orderRef.get(), poolRef.get()]);
  console.log("[reset] before", {
    orderExists: orderSnap.exists,
    poolExists: poolSnap.exists,
    orderStatus: orderSnap.data()?.status ?? null,
    deliveryAddress: orderSnap.data()?.deliveryAddress ?? null,
  });

  if (poolSnap.exists) {
    await poolRef.delete();
    console.log("[reset] deleted", poolRef.path);
  }
  if (orderSnap.exists) {
    await orderRef.delete();
    console.log("[reset] deleted", orderRef.path);
  }

  const result = await backfillFoodShareDispatchOrderIfNeeded(matchId);
  if (!result) {
    console.error("[reset] backfill skipped — match not fully paid or missing");
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, 3000));
  const [orderAfter, poolAfter] = await Promise.all([orderRef.get(), poolRef.get()]);
  const order = orderAfter.data() ?? {};

  console.log("[reset] after", {
    orderCreated: result.created,
    orderRepaired: result.repaired ?? false,
    poolExists: poolAfter.exists,
    status: order.status ?? null,
    deliveryStatus: order.deliveryStatus ?? null,
    deliveryAddress: order.deliveryAddress ?? null,
    address: order.address ?? null,
    lat: order.lat ?? null,
    lng: order.lng ?? null,
    restaurantAddress: order.restaurantAddress ?? null,
    items: order.items ?? null,
    driverId: order.driverId ?? null,
    assignedDriverId: order.assignedDriverId ?? null,
  });
}

main().catch((err) => {
  console.error("[reset] failed", err);
  process.exit(1);
});
