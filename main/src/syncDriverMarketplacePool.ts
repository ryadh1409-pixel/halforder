/**
 * Denormalized driver dispatch queue — query-safe under Firestore rules
 * (drivers read via exists(drivers/{uid}) without custom claims).
 */
import {
  FieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

const db = getFirestore();
const POOL_COLLECTION = "driver_marketplace_pool";

function isPoolEligible(data: DocumentData): boolean {
  return (
    data.deliveryType === "delivery"
    && data.status === "pending_driver"
    && data.driverId == null
    && data.assignedDriverId == null
  );
}

function buildPoolPayload(orderId: string, data: DocumentData): DocumentData {
  return {
    orderId,
    status: data.status,
    deliveryType: data.deliveryType,
    driverId: null,
    assignedDriverId: null,
    deliveryStatus: data.deliveryStatus ?? "waiting_driver",
    restaurantId: data.restaurantId ?? null,
    restaurantName: data.restaurantName ?? data.restaurantId ?? "Restaurant",
    restaurantImage: data.restaurantImage ?? null,
    restaurantPhone: data.restaurantPhone ?? data.restaurantContactPhone ?? null,
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
    estimatedDeliveryTime: data.estimatedDeliveryTime ?? data.estimatedDeliveryMinutes ?? 20,
    createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Keeps `driver_marketplace_pool/{orderId}` in sync with unassigned marketplace orders. */
export const syncDriverMarketplacePool = onDocumentWritten(
  "orders/{orderId}",
  async (event) => {
    const orderId = event.params.orderId;
    const poolRef = db.collection(POOL_COLLECTION).doc(orderId);
    const after = event.data?.after;

    if (!after?.exists) {
      await poolRef.delete().catch(() => undefined);
      return;
    }

    const data = after.data() ?? {};
    if (isPoolEligible(data)) {
      await poolRef.set(buildPoolPayload(orderId, data), {merge: true});
      logger.debug("driver_marketplace_pool upsert", {orderId});
      return;
    }

    await poolRef.delete().catch(() => undefined);
    logger.debug("driver_marketplace_pool removed", {orderId});
  },
);
