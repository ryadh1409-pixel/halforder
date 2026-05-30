/**
 * One-time cleanup: remove driver_marketplace_pool docs older than 24 hours.
 *
 * Usage (from main/, with Application Default Credentials):
 *   npm run build && npm run cleanup:pool
 */
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {ORDER_EXPIRY_MS, timestampToMillis} from "../orderExpiry.js";

initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID
    ?? process.env.GOOGLE_CLOUD_PROJECT
    ?? "halforfer",
});

const db = getFirestore();
const POOL = "driver_marketplace_pool";

async function main(): Promise<void> {
  const now = Date.now();
  const cutoff = now - ORDER_EXPIRY_MS;
  const snap = await db.collection(POOL).get();
  let removed = 0;
  let kept = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const ms = timestampToMillis(data.createdAt);
    const stale = ms != null && ms < cutoff;
    if (!stale) {
      kept++;
      continue;
    }
    await doc.ref.delete();
    removed++;
    console.log("[cleanup:pool] removed", {
      orderId: doc.id,
      createdAtMs: ms,
      ageHours: Math.round((now - (ms as number)) / 3600000),
    });
  }

  console.log("[cleanup:pool] complete", {total: snap.size, removed, kept, cutoffMs: cutoff});
}

main().catch((err) => {
  console.error("[cleanup:pool] failed", err);
  process.exit(1);
});
