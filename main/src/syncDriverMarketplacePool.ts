/**
 * Keeps `driver_marketplace_pool/{orderId}` in sync with paid, claimable marketplace orders.
 *
 * Pipeline: orders/{id} write → this function → driver_marketplace_pool/{id} → driver listeners.
 */
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {
  resolveMarketplaceCreatedAtMs,
  timestampToMillis,
} from "./orderExpiry.js";
import {normalizeMarketplaceDeliveryStatus} from "./marketplaceDeliveryStatus.js";
import {
  evaluateMarketplacePublishDebug,
  hasDriverAssigned,
  marketplacePoolRemoveReason,
  shouldRemoveFromDriverPool,
} from "./marketplacePoolLifecycle.js";
import {repairOrderPaidStateIfNeeded} from "./repairOrderPaidState.js";

const db = getFirestore();
const POOL_COLLECTION = "driver_marketplace_pool";

/** Confirms cold-start module load (search Cloud Logging for this string). */
logger.info("[marketplace-sync-module-loaded]", {
  trigger: "orders/{orderId}",
  region: "us-central1",
  poolCollection: POOL_COLLECTION,
  maxOrderAgeMs: 86400000,
});

function buildPoolPayload(orderId: string, data: DocumentData): DocumentData {
  const deliveryStatus = normalizeMarketplaceDeliveryStatus(data.deliveryStatus);
  const createdAtMs = resolveMarketplaceCreatedAtMs(data);
  const etaMinutes =
    typeof data.estimatedDeliveryMinutes === "number"
      && data.estimatedDeliveryMinutes > 0
      && data.estimatedDeliveryMinutes < 180
      ? data.estimatedDeliveryMinutes
      : typeof data.estimatedDeliveryTime === "number"
        && data.estimatedDeliveryTime > 0
        && data.estimatedDeliveryTime < 180
        ? data.estimatedDeliveryTime
        : 35;

  return {
    orderId,
    status: data.status,
    deliveryType: data.deliveryType,
    deliveryStatus,
    paymentStatus: "paid",
    expired: false,
    marketplaceArchived: false,
    driverId: null,
    assignedDriverId: null,
    restaurantId: data.restaurantId ?? null,
    restaurantName: data.restaurantName ?? data.restaurantId ?? "Restaurant",
    restaurantImage: data.restaurantImage ?? null,
    restaurantPhone: data.restaurantPhone ?? data.restaurantContactPhone ?? null,
    restaurantAddress: data.restaurantAddress ?? null,
    customerName: data.customerName ?? null,
    customerPhone: data.customerPhone ?? data.customerPhoneNumber ?? null,
    deliveryAddress: data.deliveryAddress ?? null,
    deliveryLocation: data.deliveryLocation ?? null,
    userLocation: data.userLocation ?? null,
    restaurantLocation: data.restaurantLocation ?? null,
    items: Array.isArray(data.items) ? data.items : [],
    subtotal: data.subtotal ?? 0,
    deliveryFee: data.deliveryFee ?? 0,
    totalPrice: data.totalPrice ?? data.total ?? 0,
    estimatedDeliveryTime: etaMinutes,
    estimatedDeliveryMinutes: etaMinutes,
    createdAt:
      createdAtMs != null
        ? Timestamp.fromMillis(createdAtMs)
        : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function handleOrderWrite(
  orderId: string,
  beforeExists: boolean,
  afterExists: boolean,
  data: DocumentData,
): Promise<void> {
  const poolRef = db.collection(POOL_COLLECTION).doc(orderId);

  logger.info("[marketplace-debug-entry]", {
    orderId,
    collection: "orders",
    poolCollection: POOL_COLLECTION,
    beforeExists,
    afterExists,
  });

  if (!afterExists) {
    await poolRef.delete().catch(() => undefined);
    logger.info("[marketplace-remove]", {orderId, reason: "order_deleted"});
    logger.info("[marketplace-remove-reason]", {orderId, reason: "order_deleted"});
    logger.info("[marketplace-debug-reject-reason]", {orderId, reason: "order_deleted"});
    return;
  }

  const courier = typeof data.deliveryStatus === "string"
    ? data.deliveryStatus.trim().toLowerCase()
    : "";
  const kitchen = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  const fulfillmentAdvanced =
    kitchen === "accepted" ||
    kitchen === "restaurant_accepted" ||
    kitchen === "preparing" ||
    kitchen === "ready" ||
    kitchen === "ready_for_pickup" ||
    courier === "accepted" ||
    courier === "preparing" ||
    courier === "ready_for_pickup" ||
    courier === "driver_assigned" ||
    courier === "picked_up" ||
    courier === "delivered";

  if (!fulfillmentAdvanced) {
    const paid = String(data.paymentStatus ?? "").trim().toLowerCase() === "paid";
    const kitchenStatus = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
    if (paid && kitchenStatus !== "awaiting_payment" && kitchenStatus !== "pending_payment") {
      logger.info("[marketplace-sync] skip repair — paid with post-payment status", {
        orderId,
        kitchenStatus,
      });
    } else {
    const repaired = await repairOrderPaidStateIfNeeded(orderId, data);
    if (repaired) {
      logger.info("[marketplace-sync] paid_status_repair_applied", {orderId});
      return;
    }
    }
  }

  const debug = evaluateMarketplacePublishDebug(orderId, data);

  logger.info("[marketplace-debug-visibility]", debug);
  logger.info("[marketplace-sync-status]", {
    orderId,
    paymentStatus: debug.paymentStatus,
    kitchenStatus: debug.kitchenStatus,
    courierStatus: debug.courierStatus,
    normalizedCourier: debug.normalizedCourier,
    deliveryType: debug.deliveryType,
    assignedDriverId: debug.assignedDriverId,
    driverId: debug.driverId,
    expired: debug.expired,
    marketplaceArchived: debug.marketplaceArchived,
    shouldPublishToMarketplace: debug.shouldPublishToMarketplace,
    rejectReason: debug.rejectReason,
    checks: debug.checks,
  });
  logger.info("[marketplace-sync-createdAt]", {
    orderId,
    createdAtMs: debug.createdAtMs,
    createdAtRaw: timestampToMillis(data.createdAt),
    paidAtMs: timestampToMillis(data.paidAt),
    readyAtMs: timestampToMillis(data.readyAt),
  });

  if (hasDriverAssigned(data)) {
    logger.info("[marketplace-driver-assigned]", {
      orderId,
      driverId: data.driverId ?? null,
      assignedDriverId: data.assignedDriverId ?? null,
    });
  }

  if (debug.shouldPublishToMarketplace) {
    logger.info("[marketplace-debug-publish-attempt]", {orderId});
    try {
      await poolRef.set(buildPoolPayload(orderId, data), {merge: true});
      logger.info("[marketplace-publish]", {
        orderId,
        insertedIntoPool: true,
        poolPath: `${POOL_COLLECTION}/${orderId}`,
        deliveryStatus: debug.normalizedCourier,
      });
      logger.info("[marketplace-order-visible]", {
        orderId,
        paymentStatus: data.paymentStatus,
        deliveryStatus: data.deliveryStatus,
      });
    } catch (err) {
      logger.error("[marketplace-publish-error]", {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    return;
  }

  logger.info("[marketplace-debug-reject-reason]", {
    orderId,
    reason: debug.rejectReason,
    shouldRemove: shouldRemoveFromDriverPool(data),
  });

  if (shouldRemoveFromDriverPool(data)) {
    const reason = marketplacePoolRemoveReason(data);
    await poolRef.delete().catch(() => undefined);
    logger.info("[marketplace-remove]", {orderId, reason, removedFromPool: true});
    logger.info("[marketplace-remove-reason]", {orderId, reason});
    return;
  }

  logger.info("[marketplace-sync-skip]", {
    orderId,
    reason: debug.rejectReason,
    note: "not_publishable_yet_pool_unchanged",
  });
}

/**
 * Firestore trigger: top-level `orders/{orderId}` only (not nested restaurant paths).
 */
export const syncDriverMarketplacePool = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
  },
  async (event) => {
    console.log("[marketplace-trigger-fired]", event.params.orderId);
    try {
      const orderId = event.params.orderId as string;
      const before = event.data?.before;
      const after = event.data?.after;
      await handleOrderWrite(
        orderId,
        before?.exists ?? false,
        after?.exists ?? false,
        after?.data() ?? {},
      );
    } catch (e) {
      console.error("[marketplace-trigger-crash]", e);
      logger.error("[marketplace-trigger-crash]", {
        orderId: event.params.orderId,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
);
