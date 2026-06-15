/**
 * One-off: backfill orders/{matchId} for a fully-paid food-share match.
 * Usage: npx tsx stripe-backend/scripts/backfillFoodShareDispatch.ts <matchId>
 */
import * as admin from "firebase-admin";
import {backfillFoodShareDispatchOrderIfNeeded} from "../src/foodShareDispatchOrder.js";

const matchId = process.argv[2]?.trim();
if (!matchId) {
  console.error("Usage: npx tsx stripe-backend/scripts/backfillFoodShareDispatch.ts <matchId>");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function main(): Promise<void> {
  const result = await backfillFoodShareDispatchOrderIfNeeded(matchId);
  if (!result) {
    console.log("[backfill] skipped — match not fully paid or not found", {matchId});
    process.exit(0);
  }

  const poolSnap = await db.doc(`driver_marketplace_pool/${result.orderId}`).get();
  console.log("[backfill] done", {
    matchId,
    orderId: result.orderId,
    orderCreated: result.created,
    poolExists: poolSnap.exists,
    poolPath: `driver_marketplace_pool/${result.orderId}`,
    poolDeliveryStatus: poolSnap.data()?.deliveryStatus ?? null,
    poolPaymentStatus: poolSnap.data()?.paymentStatus ?? null,
  });

  if (!poolSnap.exists) {
    console.warn(
      "[backfill] pool doc missing — deploy syncDriverMarketplacePool or wait for trigger",
    );
  }
}

main().catch((err) => {
  console.error("[backfill] failed", err);
  process.exit(1);
});
