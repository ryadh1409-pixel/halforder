/**
 * Scheduled cleanup — evicts stale marketplace rows (>24h) from active driver visibility.
 * Preserves `orders/{id}` history; only hides from pools and flags `expired` when truly stale.
 */
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {isOrderExpired, timestampToMillis} from "./orderExpiry.js";
import {
  hasDriverAssigned,
  isPoolExpiredByAge,
  marketplacePoolRemoveReason,
  shouldRemoveFromDriverPool,
} from "./marketplacePoolLifecycle.js";

const db = getFirestore();

const POOL_COLLECTION = "driver_marketplace_pool";
const PUBLIC_MATCHABLE_COLLECTION = "public_matchable_orders";

async function expireMarketplaceOrder(orderId: string, reason: string): Promise<void> {
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return;

  const data = snap.data() ?? {};
  if (data.expired === true) return;
  if (hasDriverAssigned(data)) return;
  if (!isPoolExpiredByAge(data)) return;

  await orderRef.set(
    {
      expired: true,
      marketplaceArchived: true,
      marketplaceExpiredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deliveryStatus: "cancelled",
      status: "cancelled",
    },
    {merge: true},
  );
  logger.info("[marketplace-cleanup] order_expired", {orderId, reason});
}

async function removePoolDoc(orderId: string, reason: string): Promise<void> {
  await db.collection(POOL_COLLECTION).doc(orderId).delete().catch(() => undefined);
  logger.info("[marketplace-remove]", {orderId, reason, source: "cleanup"});
  logger.info("[marketplace-remove-reason]", {orderId, reason, source: "cleanup"});
}

/** Sync pool mirror with canonical order state (strict 24h window). */
async function cleanupDriverMarketplacePool(): Promise<number> {
  const snap = await db.collection(POOL_COLLECTION).limit(500).get();
  let removed = 0;

  for (const doc of snap.docs) {
    const poolData = doc.data();
    const orderId = typeof poolData.orderId === "string" ? poolData.orderId : doc.id;
    const poolCreatedMs = timestampToMillis(poolData.createdAt);
    const poolStale =
      poolCreatedMs != null && Date.now() - poolCreatedMs > 86400000;

    const orderSnap = await db.collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      await removePoolDoc(orderId, "orphan_order_missing");
      removed++;
      continue;
    }

    const orderData = orderSnap.data() ?? {};
    if (!shouldRemoveFromDriverPool(orderData) && !poolStale) {
      continue;
    }

    const reason = poolStale ? "pool_doc_stale_24h" : marketplacePoolRemoveReason(orderData);
    await removePoolDoc(orderId, reason);
    if (isPoolExpiredByAge(orderData)) {
      await expireMarketplaceOrder(orderId, reason);
    }
    removed++;
  }

  return removed;
}

async function cleanupPublicMatchableOrders(): Promise<number> {
  const snap = await db.collection(PUBLIC_MATCHABLE_COLLECTION).limit(500).get();
  let removed = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isOrderExpired(data.createdAt) && !isOrderExpired(data.updatedAt)) continue;
    await doc.ref.delete().catch(() => undefined);
    logger.info("[marketplace-remove]", {docId: doc.id, reason: "public_matchable_stale"});
    removed++;
  }

  return removed;
}

async function cleanupStaleDeliveryOrders(): Promise<number> {
  const snap = await db
    .collection("orders")
    .where("deliveryType", "==", "delivery")
    .where("paymentStatus", "==", "paid")
    .limit(200)
    .get();

  let expired = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (hasDriverAssigned(data)) continue;
    if (!isPoolExpiredByAge(data)) continue;

    await removePoolDoc(doc.id, "order_stale_24h");
    await expireMarketplaceOrder(doc.id, "order_stale_24h");
    expired++;
  }
  return expired;
}

/** Every 15 minutes — archive marketplace orders older than 24h. */
export const cleanupExpiredOrders = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "UTC",
    retryCount: 1,
  },
  async () => {
    const started = Date.now();
    logger.info("[marketplace-cleanup] run_start");

    const [poolRemoved, publicRemoved, ordersExpired] = await Promise.all([
      cleanupDriverMarketplacePool(),
      cleanupPublicMatchableOrders(),
      cleanupStaleDeliveryOrders(),
    ]);

    logger.info("[marketplace-cleanup] run_complete", {
      poolRemoved,
      publicRemoved,
      ordersExpired,
      durationMs: Date.now() - started,
    });
  },
);
