import {
  assertDeliveryEligibleForOrder,
  deliveryFeeForTier,
} from '@/lib/delivery/deliveryEligibility';
import { logCustomerOrderPipeline } from '@/lib/customerOrderPipelineLog';
import { logCustomerOrderSnapshot } from '@/lib/customerOrderSnapshotLog';
import { applyStageLockToOrder } from '@/lib/orderStageLock';
import {
  clearOrderListenerCommitCache,
  reconcileOrderSnapshotStage,
} from '@/lib/orderListenerCommit';
import { traceOrderStageRender } from '@/lib/orderStageTrace';
import { ENABLE_ORDER_TRACE } from '@/lib/orderTraceFlags';
import {
  getActiveRestaurantOrdersQuery,
  getRestaurantArchivedOrdersQuery,
  isRestaurantDashboardOrder,
} from '@/lib/restaurantActiveOrdersQuery';
import { canCustomerCancelMarketplaceOrder as canCustomerCancelByStage } from '@/lib/customerOrderCancelUx';
import { filterFreshRestaurantOrders } from '@/lib/restaurantOrderFreshness';
import {
  deriveOrderStage,
  isOrderStageAtLeast,
  logOrderStage,
  type OrderStageInput,
} from '@/services/orderStage';
import {
  protectedUpdateOrder,
  rawUpdateOrder,
  tracedAddOrder,
} from '@/services/orderFirestoreWrite';
import { parseLegacyLatLng } from '@/lib/location/coordinates';
import { fetchRestaurantLocation, restaurantLocationToLegacy } from '@/services/location/restaurantLocation';
import type { DeliveryDistanceTier } from '@/types/deliveryEligibility';
import type { CustomerLocationRecord } from '@/types/location';
import { formatOrderTime } from '@/utils/time';
import { safeToMillis, warnDevIfUnparsableTimestamp } from '@/utils/safeToMillis';
import { auth, db, ensureAuthReady } from './firebase';
import { normalizeDeliveryStatus, type DeliveryStatus } from './deliveryStatus';
import type {
  CustomerSnapshot,
  DriverSnapshot,
  RestaurantSnapshot,
} from '@/types/order';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';


/** Full delivery lifecycle (plus rejected / ready for handoff). */
export type OrderStatus =
  | 'awaiting_payment'
  | 'payment_processing'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'pending'
  | 'pending_driver'
  | 'driver_accepted'
  | 'driver_assigned'
  | 'arriving_restaurant'
  | 'picked_up_pending'
  | 'accepted'
  | 'restaurant_accepted'
  | 'preparing'
  | 'ready'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'on_the_way'
  | 'arrived_customer'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type PaymentStatus = 'unpaid' | 'processing' | 'paid' | 'failed' | 'refunded';

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
};

export type LatLng = { lat: number; lng: number; heading?: number | null };

export type RestaurantOrder = {
  id: string;
  userId: string;
  customerName: string | null;
  customerPhone: string | null;
  restaurantId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalPrice: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  stripePaymentIntentId: string | null;
  /** Canonical Stripe PI id (mirrors `stripePaymentIntentId` when set). */
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  driverId: string | null;
  assignedDriverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  groupId: string | null;
  estimatedDeliveryTime: number;
  deliveryLocation: { lat: number; lng: number; address: string } | null;
  customerLocation: LatLng | null;
  userLocation: LatLng | null;
  restaurantLocation: LatLng | null;
  driverLocation: LatLng | null;
  notes: string | null;
  createdAtLabel: string;
  /** Firestore `createdAt` millis when available (for “today” stats). */
  createdAtMs: number | null;
  /** Soft-archive: removed from default restaurant dashboard list. */
  archivedByRestaurant: boolean;
  hiddenForRestaurant: boolean;
  archivedAtMs: number | null;
  hiddenAtMs: number | null;
  restoredAtMs: number | null;
  restaurant: RestaurantSnapshot;
  customer: CustomerSnapshot;
  driver: DriverSnapshot | null;
  acceptedAtMs: number | null;
  preparedAtMs: number | null;
  readyAtMs: number | null;
  pickedUpAtMs: number | null;
  deliveredAtMs: number | null;
  completedAtMs: number | null;
  cancelledAtMs: number | null;
  /** Persisted driver payout (80% of delivery fee) — set on completion. */
  driverPayout: number | null;
  platformFee: number | null;
  customerTotal: number | null;
  earningsRecorded: boolean;
  /** Firestore `updatedAt` millis — listener deduplication. */
  updatedAtMs: number | null;
  /** 4-digit handoff PIN — shown to customer, entered by driver to complete. */
  deliveryPin: string | null;
  /** Encoded polyline for map route (optional; from Directions API). */
  routePolyline: string | null;
  deliveryType: 'delivery' | 'pickup';
  /** Root Firestore `deliveryAddress` when `deliveryLocation` is partial. */
  deliveryAddress: string | null;
};

function makeGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseStatus(value: unknown): OrderStatus {
  const s = typeof value === 'string' ? value : '';
  if (s === 'pending_payment') return 'awaiting_payment';
  if (s === 'confirmed') return 'payment_confirmed';
  if (
    s === 'awaiting_payment' ||
    s === 'payment_processing' ||
    s === 'payment_confirmed' ||
    s === 'payment_failed' ||
    s === 'pending' ||
    s === 'pending_driver' ||
    s === 'driver_accepted' ||
    s === 'driver_assigned' ||
    s === 'arriving_restaurant' ||
    s === 'picked_up_pending' ||
    s === 'accepted' ||
    s === 'restaurant_accepted' ||
    s === 'preparing' ||
    s === 'ready' ||
    s === 'ready_for_pickup' ||
    s === 'picked_up' ||
    s === 'on_the_way' ||
    s === 'arrived_customer' ||
    s === 'delivered' ||
    s === 'completed' ||
    s === 'cancelled' ||
    s === 'rejected'
  ) {
    return s;
  }
  return 'pending';
}

function parsePaymentStatus(value: unknown, orderStatus: OrderStatus): PaymentStatus {
  const p = typeof value === 'string' ? value : '';
  if (
    p === 'paid' ||
    p === 'unpaid' ||
    p === 'processing' ||
    p === 'failed' ||
    p === 'refunded'
  ) {
    return p;
  }
  if (orderStatus === 'payment_processing') return 'processing';
  if (orderStatus === 'awaiting_payment') return 'unpaid';
  if (orderStatus === 'payment_confirmed') return 'paid';
  return 'paid';
}

function parseLatLng(value: unknown): LatLng | null {
  return parseLegacyLatLng(value);
}

function toCreatedAtLabel(value: unknown, timeZone?: string): string {
  return formatOrderTime(value, { timeZone });
}

function resolveMappedDeliveryLocation(
  data: Record<string, unknown>,
  customerLoc: LatLng | null,
): { lat: number; lng: number; address: string } | null {
  const delivery = data.deliveryLocation;
  const deliveryAddress =
    typeof data.deliveryAddress === 'string' ? data.deliveryAddress.trim() : '';

  if (delivery && typeof delivery === 'object') {
    const lat = (delivery as { lat?: unknown }).lat;
    const lng = (delivery as { lng?: unknown }).lng;
    const nestedAddress =
      typeof (delivery as { address?: unknown }).address === 'string'
        ? String((delivery as { address: string }).address).trim()
        : '';
    const address = nestedAddress || deliveryAddress;
    if (typeof lat === 'number' && typeof lng === 'number' && address) {
      return { lat, lng, address };
    }
    if (address && customerLoc) {
      return { lat: customerLoc.lat, lng: customerLoc.lng, address };
    }
    if (address) {
      return { lat: 0, lng: 0, address };
    }
  }

  if (deliveryAddress) {
    if (customerLoc) {
      return { lat: customerLoc.lat, lng: customerLoc.lng, address: deliveryAddress };
    }
    return { lat: 0, lng: 0, address: deliveryAddress };
  }

  return null;
}

/** True when the document is a paid marketplace delivery order (not half-order / pickup-only). */
export function isMarketplaceDeliveryOrderData(
  raw: Record<string, unknown>,
  mapped?: Pick<
    RestaurantOrder,
    'deliveryType' | 'restaurantId' | 'items' | 'deliveryAddress' | 'deliveryLocation'
  > | null,
): boolean {
  const deliveryType = raw.deliveryType ?? mapped?.deliveryType;
  if (deliveryType === 'pickup') return false;
  if (deliveryType === 'delivery') {
    const rid =
      typeof raw.restaurantId === 'string'
        ? raw.restaurantId.trim()
        : mapped?.restaurantId?.trim() ?? '';
    return rid.length > 0;
  }
  const restaurantId =
    typeof raw.restaurantId === 'string'
      ? raw.restaurantId.trim()
      : mapped?.restaurantId?.trim() ?? '';
  if (!restaurantId) return false;
  const hasItems =
    (Array.isArray(raw.items) && raw.items.length > 0) ||
    (mapped?.items?.length ?? 0) > 0;
  const hasAddress =
    (typeof raw.deliveryAddress === 'string' && raw.deliveryAddress.trim().length > 0) ||
    Boolean(mapped?.deliveryAddress?.trim()) ||
    Boolean(mapped?.deliveryLocation?.address?.trim());
  return hasItems && hasAddress;
}

function mapDocToRestaurantOrderFromData(
  d: { id: string; data: () => Record<string, unknown> },
  fallbackRestaurantId?: string,
  options?: { timeZone?: string },
): RestaurantOrder {
  const data = d.data();
  warnDevIfUnparsableTimestamp(d.id, 'createdAt', data.createdAt);
  warnDevIfUnparsableTimestamp(d.id, 'acceptedAt', data.acceptedAt);
  warnDevIfUnparsableTimestamp(d.id, 'pickedUpAt', data.pickedUpAt);
  warnDevIfUnparsableTimestamp(d.id, 'deliveredAt', data.deliveredAt);
  warnDevIfUnparsableTimestamp(d.id, 'cancelledAt', data.cancelledAt);
  const items = Array.isArray(data.items)
    ? data.items.map((item) => ({
        id:
          item && typeof item === 'object' && 'id' in item
            ? String((item as { id: unknown }).id)
            : '',
        name:
          item && typeof item === 'object' && 'name' in item
            ? String((item as { name: unknown }).name)
            : '',
        price:
          item && typeof item === 'object' && 'price' in item
            ? Number((item as { price: unknown }).price)
            : 0,
        qty:
          item && typeof item === 'object' && 'qty' in item
            ? Number((item as { qty: unknown }).qty)
            : 1,
        image:
          item && typeof item === 'object' && 'image' in item
            ? typeof (item as { image: unknown }).image === 'string'
              ? String((item as { image: unknown }).image)
              : null
            : null,
      }))
    : [];
  const rid =
    typeof data.restaurantId === 'string'
      ? data.restaurantId
      : typeof data.venueId === 'string'
        ? data.venueId
      : fallbackRestaurantId ?? '';
  const restaurantObj =
    data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null;
  const deliveryType: 'delivery' | 'pickup' =
    data.deliveryType === 'pickup' ? 'pickup' : 'delivery';
  const deliveryAddress =
    typeof data.deliveryAddress === 'string' && data.deliveryAddress.trim()
      ? data.deliveryAddress.trim()
      : null;
  const customerLoc =
    parseLatLng(data.customerLocation) ??
    parseLatLng(data.userLocation) ??
    parseLatLng(data.deliveryLocation);
  const userLoc = customerLoc;
  const restLoc =
    parseLatLng(data.restaurantLocation) ??
    (restaurantObj &&
    typeof restaurantObj.latitude === 'number' &&
    typeof restaurantObj.longitude === 'number'
      ? { lat: restaurantObj.latitude, lng: restaurantObj.longitude }
      : null);

  const status = parseStatus(data.status);
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : null;
  const driverObj =
    data.driver && typeof data.driver === 'object'
      ? (data.driver as Record<string, unknown>)
      : null;

  return {
    id: d.id,
    userId:
      typeof data.userId === 'string'
        ? data.userId
        : typeof data.customerId === 'string'
          ? data.customerId
          : '',
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    customerPhone:
      typeof data.customerPhone === 'string'
        ? data.customerPhone
        : typeof data.customerPhoneNumber === 'string'
          ? data.customerPhoneNumber
          : null,
    restaurantId: rid,
    items,
    subtotal:
      typeof data.subtotal === 'number'
        ? data.subtotal
        : typeof data.totalPrice === 'number'
          ? data.totalPrice
          : typeof data.total === 'number'
            ? data.total
            : 0,
    tax: typeof data.tax === 'number' ? data.tax : 0,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    totalPrice:
      typeof data.totalPrice === 'number'
        ? data.totalPrice
        : typeof data.total === 'number'
          ? data.total
          : 0,
    status,
    paymentStatus: parsePaymentStatus(data.paymentStatus, status),
    deliveryStatus: normalizeDeliveryStatus(data.deliveryStatus),
    stripePaymentIntentId:
      typeof data.stripePaymentIntentId === 'string'
        ? data.stripePaymentIntentId
        : typeof data.paymentIntentId === 'string'
          ? data.paymentIntentId
          : null,
    paymentIntentId:
      typeof data.paymentIntentId === 'string'
        ? data.paymentIntentId
        : typeof data.stripePaymentIntentId === 'string'
          ? data.stripePaymentIntentId
          : null,
    checkoutSessionId:
      typeof data.checkoutSessionId === 'string' ? data.checkoutSessionId : null,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    estimatedDeliveryTime:
      typeof data.estimatedDeliveryTime === 'number' ? data.estimatedDeliveryTime : 35,
    driverId: typeof data.driverId === 'string' ? data.driverId : null,
    assignedDriverId:
      typeof data.assignedDriverId === 'string' ? data.assignedDriverId : null,
    driverName: typeof data.driverName === 'string' ? data.driverName : null,
    driverPhone: typeof data.driverPhone === 'string' ? data.driverPhone : null,
    driverVehicle: typeof data.driverVehicle === 'string' ? data.driverVehicle : null,
    deliveryLocation: resolveMappedDeliveryLocation(data, customerLoc),
    deliveryType,
    deliveryAddress,
    customerLocation: customerLoc,
    userLocation: userLoc,
    restaurantLocation: restLoc,
    driverLocation: parseLatLng(data.driverLocation),
    notes: typeof data.notes === 'string' ? data.notes : null,
    createdAtLabel: toCreatedAtLabel(data.createdAt, options?.timeZone),
    createdAtMs: safeToMillis(data.createdAt),
    archivedByRestaurant: data.archivedByRestaurant === true,
    hiddenForRestaurant: data.hiddenForRestaurant === true,
    archivedAtMs: safeToMillis(data.archivedAt),
    hiddenAtMs: safeToMillis(data.hiddenAt),
    restoredAtMs: safeToMillis(data.restoredAt),
    restaurant: {
      id:
        restaurantObj && typeof restaurantObj.id === 'string'
          ? restaurantObj.id
          : rid,
      name:
        restaurantObj && typeof restaurantObj.name === 'string'
          ? restaurantObj.name
          : '',
      image:
        restaurantObj && typeof restaurantObj.image === 'string'
          ? restaurantObj.image
          : null,
      address:
        restaurantObj && typeof restaurantObj.address === 'string'
          ? restaurantObj.address
          : null,
      latitude:
        restaurantObj && typeof restaurantObj.latitude === 'number'
          ? restaurantObj.latitude
          : restLoc?.lat ?? null,
      longitude:
        restaurantObj && typeof restaurantObj.longitude === 'number'
          ? restaurantObj.longitude
          : restLoc?.lng ?? null,
    },
    customer: {
      id:
        customerObj && typeof customerObj.id === 'string'
          ? customerObj.id
          : typeof data.userId === 'string'
            ? data.userId
            : typeof data.customerId === 'string'
              ? data.customerId
              : '',
      name:
        customerObj && typeof customerObj.name === 'string'
          ? customerObj.name
          : typeof data.customerName === 'string'
            ? data.customerName
            : '',
      avatar:
        customerObj && typeof customerObj.avatar === 'string'
          ? customerObj.avatar
          : null,
      address:
        customerObj && typeof customerObj.address === 'string'
          ? customerObj.address
          : deliveryAddress ??
            (typeof (data.deliveryLocation as { address?: unknown } | undefined)?.address ===
            'string'
              ? String((data.deliveryLocation as { address: string }).address)
              : null),
    },
    driver:
      driverObj || data.driverId
        ? {
            id:
              driverObj && typeof driverObj.id === 'string'
                ? driverObj.id
                : typeof data.driverId === 'string'
                  ? data.driverId
                  : '',
            name:
              driverObj && typeof driverObj.name === 'string'
                ? driverObj.name
                : typeof data.driverName === 'string'
                  ? data.driverName
                  : '',
            phone:
              driverObj && typeof driverObj.phone === 'string'
                ? driverObj.phone
                : typeof data.driverPhone === 'string'
                  ? data.driverPhone
                  : null,
            vehicle:
              driverObj && typeof driverObj.vehicle === 'string'
                ? driverObj.vehicle
                : typeof data.driverVehicle === 'string'
                  ? data.driverVehicle
                  : null,
            avatar:
              driverObj && typeof driverObj.avatar === 'string'
                ? driverObj.avatar
                : null,
          }
        : null,
    acceptedAtMs: safeToMillis(data.acceptedAt),
    preparedAtMs: safeToMillis(data.preparedAt),
    readyAtMs: safeToMillis(data.readyAt),
    pickedUpAtMs: safeToMillis(data.pickedUpAt),
    deliveredAtMs: safeToMillis(data.deliveredAt),
    completedAtMs: safeToMillis(data.completedAt),
    cancelledAtMs: safeToMillis(data.cancelledAt),
    driverPayout:
      typeof data.driverPayout === 'number' && Number.isFinite(data.driverPayout)
        ? data.driverPayout
        : null,
    platformFee:
      typeof data.platformFee === 'number' && Number.isFinite(data.platformFee)
        ? data.platformFee
        : null,
    customerTotal:
      typeof data.customerTotal === 'number' && Number.isFinite(data.customerTotal)
        ? data.customerTotal
        : null,
    earningsRecorded: data.earningsRecorded === true,
    updatedAtMs: safeToMillis(data.updatedAt),
    deliveryPin:
      typeof data.deliveryPin === 'string' && /^\d{4}$/.test(data.deliveryPin)
        ? data.deliveryPin
        : null,
    routePolyline: typeof data.routePolyline === 'string' ? data.routePolyline : null,
  };
}

/** Map a Firestore order document (or `{ id, data }` shim) to {@link RestaurantOrder}. */
export function mapDocToRestaurantOrder(
  snap: DocumentSnapshot | { id: string; data: () => Record<string, unknown> },
  fallbackRestaurantId?: string,
  options?: { timeZone?: string },
): RestaurantOrder {
  const docLike =
    snap && typeof snap === 'object' && 'exists' in snap
      ? {
          id: (snap as DocumentSnapshot).id,
          data: () =>
            ((snap as DocumentSnapshot).data() ?? {}) as Record<string, unknown>,
        }
      : (snap as { id: string; data: () => Record<string, unknown> });
  return mapDocToRestaurantOrderFromData(docLike, fallbackRestaurantId, options);
}

export type MarketplaceOrderCreatePayload = {
  userId: string;
  restaurantId: string;
  items: OrderItem[];
  totalPrice: number;
  deliveryType?: 'delivery' | 'pickup';
  driverId?: string | null;
  deliveryLocation: { lat: number; lng: number; address: string };
  customerLocation?: CustomerLocationRecord;
  restaurantLocation?: LatLng | null;
};

export async function createOrder(
  payload: MarketplaceOrderCreatePayload,
): Promise<string> {
  await ensureAuthReady();
  const customerUid = auth.currentUser?.uid?.trim() ?? '';
  if (!customerUid) {
    throw new Error('Please sign in first.');
  }

  const deliveryType = payload.deliveryType ?? 'delivery';

  try {
    const existingUnpaid = await getDocs(
      query(
        collection(db, 'orders'),
        where('customerId', '==', customerUid),
        where('restaurantId', '==', payload.restaurantId),
        where('paymentStatus', '==', 'unpaid'),
        where('status', '==', 'awaiting_payment'),
        limit(1),
      ),
    );
    if (!existingUnpaid.empty) {
      return existingUnpaid.docs[0].id;
    }
  } catch {
    /* composite index may be missing — continue to create */
  }

  let existingOrderId: string | null = null;
  try {
    const pendingSnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('restaurantId', '==', payload.restaurantId),
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc'),
        limit(8),
      ),
    );
    const found = pendingSnap.docs.find((docSnap) => {
      const gd = docSnap.data();
      return gd.groupId == null || gd.groupId === '';
    });
    if (found) existingOrderId = found.id;
  } catch {
    /* query/index may be missing — still create order */
  }
  const groupId = existingOrderId ? `grp_${existingOrderId}` : makeGroupId();
  const estimatedDeliveryTime = existingOrderId ? 25 : 35;

  const { lat, lng } = payload.deliveryLocation;
  const userLocation: LatLng = { lat, lng };
  const customerLocationRecord: CustomerLocationRecord =
    payload.customerLocation ?? {
      latitude: lat,
      longitude: lng,
      timestamp: serverTimestamp(),
    };

  let restaurantLocation: LatLng;
  if (payload.restaurantLocation) {
    restaurantLocation = payload.restaurantLocation;
  } else {
    const restaurantRecord = await fetchRestaurantLocation(payload.restaurantId);
    restaurantLocation = restaurantLocationToLegacy(restaurantRecord);
  }
  let restaurantRaw: Record<string, unknown> = {};
  let restaurantSnapshot: RestaurantSnapshot = {
    id: payload.restaurantId,
    name: '',
    image: null,
    address: null,
    latitude: restaurantLocation.lat,
    longitude: restaurantLocation.lng,
  };
  let customerSnapshot: CustomerSnapshot = {
    id: customerUid,
    name: '',
    avatar: null,
    address: payload.deliveryLocation.address,
  };
  try {
    const [restaurantSnap, customerSnap] = await Promise.all([
      getDoc(doc(db, 'restaurants', payload.restaurantId)),
      getDoc(doc(db, 'users', customerUid)),
    ]);
    if (restaurantSnap.exists()) {
      const r = restaurantSnap.data() as Record<string, unknown>;
      restaurantRaw = r;
      restaurantSnapshot = {
        id: payload.restaurantId,
        name:
          typeof r.name === 'string'
            ? r.name
            : typeof r.restaurantName === 'string'
              ? r.restaurantName
              : '',
        image:
          typeof r.image === 'string'
            ? r.image
            : typeof r.logoUrl === 'string'
              ? r.logoUrl
              : typeof r.photoUrl === 'string'
                ? r.photoUrl
                : null,
        address:
          typeof r.address === 'string'
            ? r.address
            : (r.location &&
                typeof r.location === 'object' &&
                typeof (r.location as { address?: unknown }).address === 'string'
              ? String((r.location as { address: string }).address)
              : null),
        latitude:
          typeof r.latitude === 'number'
            ? r.latitude
            : typeof r.lat === 'number'
              ? r.lat
              : restaurantLocation.lat,
        longitude:
          typeof r.longitude === 'number'
            ? r.longitude
            : typeof r.lng === 'number'
              ? r.lng
              : restaurantLocation.lng,
      };
    }
    if (customerSnap.exists()) {
      const u = customerSnap.data() as Record<string, unknown>;
      customerSnapshot = {
        id: customerUid,
        name: typeof u.name === 'string' ? u.name : '',
        avatar:
          typeof u.avatar === 'string'
            ? u.avatar
            : typeof u.photoURL === 'string'
              ? u.photoURL
              : null,
        address: payload.deliveryLocation.address,
      };
    }
  } catch {
    // Keep snapshot fallbacks and still create order.
  }

  if (payload.userId.trim() !== customerUid) {
    console.warn('[createOrder] payload.userId mismatch; using auth uid', {
      payloadUserId: payload.userId,
      customerUid,
      restaurantId: payload.restaurantId,
    });
  }

  let deliveryDistanceKm: number | null = null;
  let deliveryTier: DeliveryDistanceTier = deliveryType === 'pickup' ? 'near' : 'unknown';
  let deliveryEligible = deliveryType === 'pickup';
  let maxDeliveryDistanceKmAtCheckout = 15;
  let orderDeliveryFee = 0;

  try {
    const zoneCheck = assertDeliveryEligibleForOrder({
      deliveryType,
      customerLat: lat,
      customerLng: lng,
      restaurantData: restaurantRaw,
      restaurantCoords: restaurantLocation,
    });
    deliveryDistanceKm = zoneCheck.distanceKm;
    deliveryTier = zoneCheck.tier;
    deliveryEligible = true;
    maxDeliveryDistanceKmAtCheckout = zoneCheck.settings.maxDeliveryDistanceKm;
    if (deliveryType === 'delivery') {
      const feeEst = deliveryFeeForTier(
        zoneCheck.tier,
        zoneCheck.distanceKm,
        zoneCheck.settings,
      );
      orderDeliveryFee = feeEst.amount ?? 0;
    }
  } catch (zoneErr) {
    if (deliveryType === 'delivery') {
      throw zoneErr;
    }
  }

  const orderPayload = {
    userId: customerUid,
    customerId: customerUid,
    restaurantId: payload.restaurantId,
    venueId: payload.restaurantId,
    items: payload.items,
    customerName: null,
    customerPhone: null,
    subtotal: payload.totalPrice,
    tax: 0,
    deliveryFee: orderDeliveryFee,
    deliveryDistanceKm,
    deliveryEligible,
    deliveryTier,
    maxDeliveryDistanceKmAtCheckout,
    totalPrice: payload.totalPrice,
    total: payload.totalPrice,
    deliveryType,
    estimatedPrepTime: estimatedDeliveryTime,
    status: 'awaiting_payment',
    deliveryStatus: 'pending',
    paymentStatus: 'unpaid',
    stripePaymentIntentId: null,
    paymentIntentId: null,
    checkoutSessionId: null,
    groupId,
    estimatedDeliveryTime,
    driverId: payload.driverId ?? null,
    assignedDriverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: null,
    deliveryLocation: payload.deliveryLocation,
    deliveryAddress: payload.deliveryLocation.address,
    customerLocation: customerLocationRecord,
    restaurant: restaurantSnapshot,
    customer: customerSnapshot,
    driver: {
      id: payload.driverId ?? null,
      name: null,
      phone: null,
      vehicle: null,
      avatar: null,
    },
    userLocation,
    restaurantLocation,
    notes: null,
    acceptedAt: null,
    preparedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    estimatedArrival: null,
    fees: 0,
    taxes: 0,
    etaMinutes: estimatedDeliveryTime,
    createdAt: serverTimestamp(),
    hiddenForRestaurant: false,
    archivedByRestaurant: false,
    archivedAt: null,
    hiddenAt: null,
    restoredAt: null,
  };
  console.log('ORDER INITIAL DELIVERY STATUS', orderPayload.deliveryStatus);
  console.log('ORDER CREATE CUSTOMER UID', customerUid);
  console.log('ORDER CREATE RESTAURANT UID', payload.restaurantId);
  console.log('ORDER CREATE PAYLOAD', orderPayload);

  let orderId: string;
  try {
    orderId = await tracedAddOrder(orderPayload, {
      fileName: 'orderService.ts',
      functionName: 'createOrder',
    });
  } catch (err) {
    console.error('[createOrder] Firestore write failed', {
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return orderId;
}

export async function getRestaurantOrderById(orderId: string): Promise<RestaurantOrder | null> {
  const trimmed = typeof orderId === 'string' ? orderId.trim() : '';
  if (!trimmed) return null;
  const snap = await getDoc(doc(db, 'orders', trimmed));
  if (!snap.exists()) return null;
  return mapDocToRestaurantOrder(snap);
}

export async function rejectOrder(orderId: string): Promise<void> {
  await applyProtectedOrderPatch(orderId, {
    status: 'rejected',
    deliveryStatus: 'cancelled',
    estimatedDeliveryTime: 0,
    updatedAt: serverTimestamp(),
    updatedBy: 'restaurantReject',
  });
}

export function customerCanCancelMarketplaceOrder(
  input: OrderStageInput | OrderStatus,
  deliveryStatus?: string | null,
  paymentStatus?: string | null,
): boolean {
  const order: OrderStageInput =
    typeof input === 'string'
      ? { status: input, deliveryStatus, paymentStatus }
      : input;
  return canCustomerCancelByStage(order);
}

export async function customerCancelMarketplaceOrder(orderId: string): Promise<void> {
  const uid = auth.currentUser?.uid?.trim() ?? '';
  if (!uid) throw new Error('Not signed in');
  const payload = {
    status: 'cancelled',
    deliveryStatus: 'cancelled',
    updatedAt: serverTimestamp(),
    cancelledAt: serverTimestamp(),
    cancelledBy: uid,
  };
  console.log('[CUSTOMER ORDER CANCEL WRITE]', {
    documentPath: `orders/${orderId}`,
    uid,
    orderId,
    payload,
  });
  await applyProtectedOrderPatch(orderId, payload);
}

export type GetRestaurantOrdersOptions = {
  timeZone?: string;
};

/**
 * Sole restaurant dashboard listener — active stages only (last 24h).
 * @see getActiveRestaurantOrdersQuery
 */
export function subscribeActiveRestaurantOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrder[]) => void,
  options?: GetRestaurantOrdersOptions,
): Unsubscribe {
  const unsub = onSnapshot(
    getActiveRestaurantOrdersQuery(restaurantId),
    (snap) => {
      try {
        const rows: RestaurantOrder[] = [];
        for (const docSnap of snap.docs) {
          const raw = docSnap.data() as Record<string, unknown>;
          if (
            !isRestaurantDashboardOrder({
              id: docSnap.id,
              ...raw,
            })
          ) {
            continue;
          }

          const pending = docSnap.metadata.hasPendingWrites;
          if (ENABLE_ORDER_TRACE && pending) {
            logOrderStage(
              { id: docSnap.id, ...raw },
              { hasPendingWrites: true },
            );
          }

          const snapshot: OrderStageInput = { id: docSnap.id, ...raw };
          const reconciled = reconcileOrderSnapshotStage(
            docSnap.id,
            snapshot,
            pending,
          );
          if (reconciled == null) {
            continue;
          }

          const merged = applyStageLockToOrder({
            ...raw,
            id: docSnap.id,
            status: reconciled.status ?? raw.status,
            deliveryStatus: reconciled.deliveryStatus ?? raw.deliveryStatus,
            paymentStatus: reconciled.paymentStatus ?? raw.paymentStatus,
          });

          if (ENABLE_ORDER_TRACE && !pending) {
            traceOrderStageRender(merged, {
              hasPendingWrites: false,
              sourceScreen: 'subscribeActiveRestaurantOrders',
            });
          }

          rows.push(
            mapDocToRestaurantOrder(
              {
                id: docSnap.id,
                data: () => merged,
              },
              restaurantId,
              { timeZone: options?.timeZone },
            ),
          );
        }

        onData(filterFreshRestaurantOrders(rows));
      } catch (e) {
        if (__DEV__) {
          console.error('[subscribeActiveRestaurantOrders]', e);
        }
        onData([]);
      }
    },
    () => {
      onData([]);
    },
  );

  return () => {
    unsub();
    clearOrderListenerCommitCache();
  };
}

/** Terminal orders older than 24h — merged with live listener for Archived tab. */
export function subscribeRestaurantArchivedOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrder[]) => void,
  options?: GetRestaurantOrdersOptions,
): Unsubscribe {
  const unsub = onSnapshot(
    getRestaurantArchivedOrdersQuery(restaurantId),
    (snap) => {
      try {
        const rows: RestaurantOrder[] = [];
        for (const docSnap of snap.docs) {
          const raw = docSnap.data() as Record<string, unknown>;
          if (
            !isRestaurantDashboardOrder({
              id: docSnap.id,
              ...raw,
            })
          ) {
            continue;
          }

          const snapshot: OrderStageInput = { id: docSnap.id, ...raw };
          const reconciled = reconcileOrderSnapshotStage(
            docSnap.id,
            snapshot,
            docSnap.metadata.hasPendingWrites,
          );
          if (reconciled == null) continue;

          const merged = applyStageLockToOrder({
            ...raw,
            id: docSnap.id,
            status: reconciled.status ?? raw.status,
            deliveryStatus: reconciled.deliveryStatus ?? raw.deliveryStatus,
            paymentStatus: reconciled.paymentStatus ?? raw.paymentStatus,
          });

          rows.push(
            mapDocToRestaurantOrder(
              { id: docSnap.id, data: () => merged },
              restaurantId,
              { timeZone: options?.timeZone },
            ),
          );
        }
        onData(rows);
      } catch (e) {
        if (__DEV__) {
          console.error('[subscribeRestaurantArchivedOrders]', e);
        }
        onData([]);
      }
    },
    () => onData([]),
  );

  return () => unsub();
}

/** @deprecated Use {@link subscribeActiveRestaurantOrders}. */
export function getOrders(
  restaurantId: string,
  onData: (orders: RestaurantOrder[]) => void,
  options?: GetRestaurantOrdersOptions,
): Unsubscribe {
  return subscribeActiveRestaurantOrders(restaurantId, onData, options);
}

function etaForStatus(status: OrderStatus): number {
  switch (status) {
    case 'awaiting_payment':
      return 0;
    case 'payment_processing':
      return 2;
    case 'payment_failed':
      return 0;
    case 'pending_driver':
      return 30;
    case 'driver_accepted':
    case 'driver_assigned':
      return 24;
    case 'arriving_restaurant':
      return 20;
    case 'picked_up_pending':
      return 18;
    case 'accepted':
    case 'restaurant_accepted':
      return 28;
    case 'preparing':
      return 22;
    case 'ready':
    case 'ready_for_pickup':
      return 18;
    case 'picked_up':
      return 14;
    case 'on_the_way':
      return 10;
    case 'arrived_customer':
      return 4;
    case 'delivered':
    case 'cancelled':
    case 'rejected':
      return 0;
    default:
      return 35;
  }
}

const DRIVER_FLOW_STATUSES = new Set<OrderStatus>([
  'picked_up_pending',
  'driver_assigned',
  'arriving_restaurant',
  'driver_accepted',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'delivered',
]);

const RESTAURANT_FLOW_STATUSES = new Set<OrderStatus>([
  'accepted',
  'restaurant_accepted',
  'preparing',
  'ready',
  'ready_for_pickup',
  'rejected',
  'cancelled',
]);

const RESTAURANT_ACCEPTABLE_KITCHEN_STATUSES = new Set<OrderStatus>([
  'awaiting_payment',
  'pending',
  'payment_confirmed',
  'pending_driver',
]);

export async function acceptRestaurantOrder(orderId: string): Promise<void> {
  const { applyRestaurantKitchenAction } = await import(
    '@/lib/restaurantKitchenActions'
  );
  const result = await applyRestaurantKitchenAction(orderId, 'accept');
  if (result === 'skipped_illegal') {
    throw new Error('Order cannot be accepted in its current state');
  }
}

/** Firestore order patch that refuses backward lifecycle transitions. */
export async function applyProtectedOrderPatch(
  orderId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await protectedUpdateOrder(orderId, patch, {
    fileName: 'orderService.ts',
    functionName: 'applyProtectedOrderPatch',
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const requested = status;
  const restaurantKitchenStatus =
    requested === 'accepted' ||
    requested === 'restaurant_accepted' ||
    requested === 'preparing' ||
    requested === 'ready' ||
    requested === 'ready_for_pickup';

  if (restaurantKitchenStatus) {
    const { applyRestaurantKitchenAction } = await import(
      '@/lib/restaurantKitchenActions'
    );
    const action =
      requested === 'accepted' || requested === 'restaurant_accepted'
        ? 'accept'
        : requested === 'preparing'
          ? 'preparing'
          : 'ready';
    await applyRestaurantKitchenAction(orderId, action);
    return;
  }

  // Driver/courier path — kitchen statuses return above; widen for legacy patch branches.
  const normalizedStatus = requested as OrderStatus;
  const patch: Record<string, unknown> = {
    status: normalizedStatus,
    estimatedDeliveryTime: etaForStatus(normalizedStatus),
    updatedAt: serverTimestamp(),
  };
  if (normalizedStatus === 'ready_for_pickup') {
    patch.preparedAt = serverTimestamp();
    patch.deliveryStatus = 'ready_for_pickup';
    patch.driverId = null;
    patch.assignedDriverId = null;
    patch.driverName = null;
    patch.driverPhone = null;
    patch.readyAt = serverTimestamp();
    if (__DEV__) {
      console.log('[MARKETPLACE READY]', {
        orderId,
        deliveryStatus: 'ready_for_pickup',
        archived: false,
        expired: false,
        insertedIntoPool: true,
      });
    }
  }
  if (
    normalizedStatus === 'picked_up_pending'
    || normalizedStatus === 'driver_assigned'
    || normalizedStatus === 'arriving_restaurant'
    || normalizedStatus === 'driver_accepted'
  ) {
    patch.deliveryStatus = 'driver_assigned';
  }
  if (normalizedStatus === 'picked_up') {
    patch.pickedUpAt = serverTimestamp();
    patch.deliveryStatus = 'picked_up';
  }
  if (normalizedStatus === 'delivered') {
    patch.deliveredAt = serverTimestamp();
    patch.completedAt = serverTimestamp();
    patch.deliveryStatus = 'delivered';
    patch.status = 'completed';
    patch.marketplaceArchived = true;
  }
  if (normalizedStatus === 'arrived_customer') {
    patch.deliveryStatus = 'near_customer';
  }
  if (__DEV__) {
    const payload = {
      orderId,
      requestedStatus: status,
      status: patch.status,
      deliveryStatus: patch.deliveryStatus ?? null,
      driverId: patch.driverId ?? '(unchanged)',
    };
    if (RESTAURANT_FLOW_STATUSES.has(normalizedStatus)) {
      console.log('[RESTAURANT FLOW] updateOrderStatus', payload);
    } else if (DRIVER_FLOW_STATUSES.has(normalizedStatus)) {
      console.log('[DRIVER FLOW] updateOrderStatus', payload);
    } else {
      console.log('[ORDER FLOW] updateOrderStatus', payload);
    }
  }
  const currentSnap = await getDoc(doc(db, 'orders', orderId));
  const currentData = currentSnap.exists()
    ? ({ id: orderId, ...(currentSnap.data() as Record<string, unknown>) } as Record<
        string,
        unknown
      >)
    : { id: orderId };

  logOrderStage({ ...currentData, ...patch });

  await applyProtectedOrderPatch(orderId, patch);
}

/** Live driver pin on the order (for customer map). */
export async function updateOrderDriverLocation(
  orderId: string,
  location: LatLng,
): Promise<void> {
  await rawUpdateOrder(
    orderId,
    {
      driverLocation: {
        lat: location.lat,
        lng: location.lng,
        ...(typeof location.heading === 'number' && Number.isFinite(location.heading)
          ? { heading: location.heading }
          : {}),
      },
    },
    {
      fileName: 'orderService.ts',
      functionName: 'updateOrderDriverLocation',
    },
  );
}

export function looksLikeMarketplaceRestaurantOrder(o: RestaurantOrder): boolean {
  return isMarketplaceDeliveryOrderData(
    {
      deliveryType: o.deliveryType,
      restaurantId: o.restaurantId,
      items: o.items,
      deliveryAddress: o.deliveryAddress,
      deliveryLocation: o.deliveryLocation,
    },
    o,
  );
}

/**
 * Customer-facing realtime listener — `orders/{orderId}` only (same path as restaurant writes).
 * Emits every snapshot so courier lifecycle updates are never dropped behind cache metadata.
 */
export function subscribeCustomerOrderById(
  orderId: string,
  onData: (order: RestaurantOrder | null) => void,
  options?: { onListenError?: (err: Error) => void },
): Unsubscribe {
  const id = orderId.trim();
  if (__DEV__) {
    console.log('[subscribeCustomerOrderById] listening', { documentPath: `orders/${id}` });
  }
  let lastSignature = '';
  return onSnapshot(
    doc(db, 'orders', id),
    { source: 'server' },
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        lastSignature = '';
        return;
      }
      try {
        const raw = snap.data() as Record<string, unknown>;
        const signature = [
          raw.status,
          raw.deliveryStatus,
          raw.paymentStatus,
          safeToMillis(raw.updatedAt),
          safeToMillis(raw.pickedUpAt),
          safeToMillis(raw.deliveredAt),
          safeToMillis(raw.completedAt),
          snap.metadata.hasPendingWrites,
          snap.metadata.fromCache,
        ].join('|');
        if (signature === lastSignature) return;
        lastSignature = signature;

        const meta = {
          fromCache: snap.metadata.fromCache,
          hasPendingWrites: snap.metadata.hasPendingWrites,
          source: 'subscribeCustomerOrderById' as const,
        };
        logCustomerOrderSnapshot(snap.id, raw, meta);
        const mapped = mapDocToRestaurantOrder(snap);
        logCustomerOrderPipeline('subscribeCustomerOrderById', snap.id, raw, mapped, {
          fromCache: meta.fromCache,
          hasPendingWrites: meta.hasPendingWrites,
        });
        onData(mapped);
      } catch (e) {
        console.warn('[subscribeCustomerOrderById] mapDoc failed', orderId, e);
        options?.onListenError?.(e instanceof Error ? e : new Error(String(e)));
      }
    },
    (err) => {
      console.warn('[subscribeCustomerOrderById] listener error', orderId, err);
      options?.onListenError?.(err);
    },
  );
}

export function subscribeOrderById(
  orderId: string,
  onData: (order: RestaurantOrder | null) => void,
  options?: {
    onListenError?: (err: Error) => void;
    /** Customer paths use raw Firestore; restaurant detail keeps stage regression guard. */
    trackingMode?: 'customer' | 'restaurant';
  },
): Unsubscribe {
  const trackingMode = options?.trackingMode ?? 'customer';
  if (trackingMode === 'customer') {
    return subscribeCustomerOrderById(orderId, onData, options);
  }

  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      try {
        const raw = snap.data() as Record<string, unknown>;
        const pending = snap.metadata.hasPendingWrites;
        const snapshot: OrderStageInput = { id: snap.id, ...raw };
        const reconciled = reconcileOrderSnapshotStage(snap.id, snapshot, pending, {
          mode: 'restaurant',
        });
        if (reconciled == null) {
          return;
        }
        if (ENABLE_ORDER_TRACE && pending) {
          logOrderStage({ id: snap.id, ...raw }, { hasPendingWrites: true });
        }
        const merged = applyStageLockToOrder({
          ...raw,
          id: snap.id,
          status: reconciled.status ?? raw.status,
          deliveryStatus: reconciled.deliveryStatus ?? raw.deliveryStatus,
          paymentStatus: reconciled.paymentStatus ?? raw.paymentStatus,
        });
        if (ENABLE_ORDER_TRACE && !pending) {
          traceOrderStageRender(merged, {
            hasPendingWrites: false,
            sourceScreen: 'subscribeOrderById',
          });
        }
        onData(mapDocToRestaurantOrder({ id: snap.id, data: () => merged }));
      } catch (e) {
        console.warn('[subscribeOrderById] mapDoc failed', orderId, e);
        options?.onListenError?.(e instanceof Error ? e : new Error(String(e)));
      }
    },
    (err) => {
      console.warn('[subscribeOrderById] listener error (keeping UI stable)', orderId, err);
      options?.onListenError?.(err);
    },
  );
}
