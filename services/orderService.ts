import {
  assertDeliveryEligibleForOrder,
  resolveOrderDeliveryFee,
} from '@/lib/delivery/deliveryEligibility';
import { computeOrderPricing, DEFAULT_TAX_RATE } from '@/lib/orderPricing';
import { resolveRestaurantTaxRate } from '@/services/platformFees';
import {
  isDeliveryStageRegression,
  resolveDeliveryStageRank,
} from '@/lib/deliveryStageRank';
import { isOrderCompleted } from '@/lib/orderCompletion';
import {
  registerCustomerOrderListener,
  unregisterCustomerOrderListener,
} from '@/lib/customerOrderListenerRegistry';
import { logCustomerOrderPipeline } from '@/lib/customerOrderPipelineLog';
import {
  logCustomerOrderSnapshot,
  logCustomerRawDoc,
  logRawFirestoreCustomerDoc,
} from '@/lib/customerOrderSnapshotLog';
import {
  logCustomerTrackingSnapshot,
  logCustomerTrackingUi,
} from '@/lib/customerTrackingLog';
import {
  evaluateCustomerSnapshotFreshness,
  logCustomerSnapshotRejected,
  logServerOrCacheOrder,
  OrderSnapshotFreshnessGate,
  QuerySnapshotFreshnessGate,
  resolveOrderFreshnessMs,
  resolveOrderUpdatedAtMs,
} from '@/lib/orderSnapshotFreshness';
import { customerOrderSnapshotSignature } from '@/lib/customerOrderSnapshotSignature';
import { logStatusRead } from '@/lib/orderTerminalStatus';
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
import { isValidGpsCoordinates } from '@/services/location/productionGps';
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
  getDocFromServer,
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
  /** Service fee charged on the order (CAD). */
  serviceFee: number;
  /** Promo discount applied (CAD). */
  promoDiscount: number;
  /** Tax rate used when the order was priced (e.g. 0.13). */
  taxRate: number;
  totalPrice: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  stripePaymentIntentId: string | null;
  /** Canonical Stripe PI id (mirrors `stripePaymentIntentId` when set). */
  paymentIntentId: string | null;
  /** Server timestamp when Stripe payment succeeded. */
  paidAt: unknown;
  paidAtMs: number | null;
  receiptNumber: string | null;
  paymentMethod: string | null;
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
  /** Persisted driver payout (configured % of delivery fee) — set on completion. */
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
  const parsed = parseLegacyLatLng(value);
  if (!parsed) return null;
  // Never treat Null Island placeholders as real GPS.
  if (!isValidGpsCoordinates(parsed.lat, parsed.lng)) return null;
  return parsed;
}

function toCreatedAtLabel(value: unknown, timeZone?: string): string {
  return formatOrderTime(value, { timeZone });
}

function finiteCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Map Firestore delivery fields → `{ lat, lng, address }`.
 * Never fabricates `{ lat: 0, lng: 0 }` when only an address exists.
 */
function resolveMappedDeliveryLocation(
  data: Record<string, unknown>,
  customerLoc: LatLng | null,
): { lat: number; lng: number; address: string } | null {
  const delivery = data.deliveryLocation;
  const deliveryAddress =
    typeof data.deliveryAddress === 'string' ? data.deliveryAddress.trim() : '';

  if (delivery && typeof delivery === 'object') {
    const d = delivery as Record<string, unknown>;
    const lat = finiteCoord(d.lat) ?? finiteCoord(d.latitude);
    const lng = finiteCoord(d.lng) ?? finiteCoord(d.longitude);
    const nestedAddress =
      typeof d.address === 'string' ? d.address.trim() : '';
    const address = nestedAddress || deliveryAddress;

    if (lat != null && lng != null && isValidGpsCoordinates(lat, lng) && address) {
      return { lat, lng, address };
    }
    if (address && customerLoc && isValidGpsCoordinates(customerLoc.lat, customerLoc.lng)) {
      return { lat: customerLoc.lat, lng: customerLoc.lng, address };
    }
    if (address) {
      console.warn(
        '[orderService] deliveryLocation has address but no valid GPS — not fabricating 0,0',
        { address, lat, lng },
      );
      return null;
    }
  }

  if (deliveryAddress) {
    if (customerLoc && isValidGpsCoordinates(customerLoc.lat, customerLoc.lng)) {
      return { lat: customerLoc.lat, lng: customerLoc.lng, address: deliveryAddress };
    }
    console.warn(
      '[orderService] deliveryAddress present without GPS — not fabricating 0,0',
      { deliveryAddress },
    );
    return null;
  }

  return null;
}

/** Persistable delivery pin — dual lat/lng + latitude/longitude for all readers. */
function buildDeliveryLocationWrite(input: {
  lat: number;
  lng: number;
  address: string;
}): { lat: number; lng: number; latitude: number; longitude: number; address: string } {
  return {
    lat: input.lat,
    lng: input.lng,
    latitude: input.lat,
    longitude: input.lng,
    address: input.address.trim(),
  };
}

function buildRestaurantLocationWrite(input: { lat: number; lng: number }): {
  lat: number;
  lng: number;
  latitude: number;
  longitude: number;
} {
  return {
    lat: input.lat,
    lng: input.lng,
    latitude: input.lat,
    longitude: input.lng,
  };
}

function assertOrderGps(
  lat: number,
  lng: number,
  label: string,
): void {
  if (!isValidGpsCoordinates(lat, lng)) {
    throw new Error(
      `${label} is missing valid GPS coordinates. Re-select your delivery address and try again.`,
    );
  }
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
  logCustomerRawDoc(d.id, data, 'mapper');
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
    (data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null) ??
    // completeMeal orders save the snapshot under "restaurantSnapshot" key
    (data.restaurantSnapshot && typeof data.restaurantSnapshot === 'object'
      ? (data.restaurantSnapshot as Record<string, unknown>)
      : null);
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
    (restaurantObj
      ? parseLatLng({
          lat:
            finiteCoord(restaurantObj.latitude) ??
            finiteCoord(restaurantObj.lat),
          lng:
            finiteCoord(restaurantObj.longitude) ??
            finiteCoord(restaurantObj.lng),
        })
      : null);

  // DEBUG — remove after confirming coordinates
  console.log('[OrderService] COORDS', d.id, {
    rawCustomerLoc: JSON.stringify(data.customerLocation),
    rawUserLoc: JSON.stringify(data.userLocation),
    rawDeliveryLoc: JSON.stringify(data.deliveryLocation),
    rawRestaurantLoc: JSON.stringify(data.restaurantLocation),
    restaurantObjLatLng: restaurantObj
      ? {
          lat: restaurantObj.latitude ?? restaurantObj.lat ?? null,
          lng: restaurantObj.longitude ?? restaurantObj.lng ?? null,
        }
      : null,
    parsedCustomerLoc: JSON.stringify(customerLoc),
    parsedRestaurantLoc: JSON.stringify(restLoc),
  });

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
    serviceFee: typeof data.serviceFee === 'number' ? data.serviceFee : 0,
    promoDiscount:
      typeof data.promoDiscount === 'number' ? data.promoDiscount : 0,
    taxRate:
      typeof data.taxRate === 'number' && Number.isFinite(data.taxRate)
        ? data.taxRate
        : 0.13,
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
    paidAt: data.paidAt ?? null,
    paidAtMs: safeToMillis(data.paidAt),
    receiptNumber:
      typeof data.receiptNumber === 'string' ? data.receiptNumber : null,
    paymentMethod:
      typeof data.paymentMethod === 'string'
        ? data.paymentMethod
        : typeof data.paymentMethodBrand === 'string'
          ? data.paymentMethodBrand
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
        restaurantObj
          ? finiteCoord(restaurantObj.latitude) ??
            finiteCoord(restaurantObj.lat) ??
            restLoc?.lat ??
            null
          : restLoc?.lat ?? null,
      longitude:
        restaurantObj
          ? finiteCoord(restaurantObj.longitude) ??
            finiteCoord(restaurantObj.lng) ??
            restLoc?.lng ??
            null
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
            vehiclePhoto:
              driverObj && typeof driverObj.vehiclePhoto === 'string'
                ? driverObj.vehiclePhoto
                : typeof data.vehiclePhoto === 'string'
                  ? data.vehiclePhoto
                  : null,
            vehicleMake:
              driverObj && typeof driverObj.vehicleMake === 'string'
                ? driverObj.vehicleMake
                : typeof data.vehicleMake === 'string'
                  ? data.vehicleMake
                  : null,
            vehicleModel:
              driverObj && typeof driverObj.vehicleModel === 'string'
                ? driverObj.vehicleModel
                : typeof data.vehicleModel === 'string'
                  ? data.vehicleModel
                  : null,
            vehicleYear: (() => {
              if (driverObj && typeof driverObj.vehicleYear === 'string') {
                return driverObj.vehicleYear;
              }
              if (driverObj && typeof driverObj.vehicleYear === 'number') {
                return String(driverObj.vehicleYear);
              }
              if (typeof data.vehicleYear === 'string') return data.vehicleYear;
              if (typeof data.vehicleYear === 'number') return String(data.vehicleYear);
              return null;
            })(),
            vehicleColor:
              driverObj && typeof driverObj.vehicleColor === 'string'
                ? driverObj.vehicleColor
                : typeof data.vehicleColor === 'string'
                  ? data.vehicleColor
                  : null,
            licensePlate:
              driverObj && typeof driverObj.licensePlate === 'string'
                ? driverObj.licensePlate
                : typeof data.licensePlate === 'string'
                  ? data.licensePlate
                  : null,
            rating: (() => {
              const candidates = [
                driverObj && (driverObj as { rating?: unknown }).rating,
                driverObj && (driverObj as { averageRating?: unknown }).averageRating,
                driverObj && (driverObj as { ratingAverage?: unknown }).ratingAverage,
                data.driverRating,
                data.driverAverageRating,
              ];
              for (const c of candidates) {
                if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
              }
              return null;
            })(),
          }
        : null,
    acceptedAtMs: safeToMillis(data.acceptedAt),
    preparedAtMs: safeToMillis(data.preparedAt),
    readyAtMs: safeToMillis(data.readyAt),
    pickedUpAtMs: safeToMillis(data.pickedUpAt),
    deliveredAtMs:
      typeof data.deliveredAtMs === 'number' && Number.isFinite(data.deliveredAtMs)
        ? data.deliveredAtMs
        : safeToMillis(data.deliveredAt),
    completedAtMs:
      typeof data.completedAtMs === 'number' && Number.isFinite(data.completedAtMs)
        ? data.completedAtMs
        : safeToMillis(data.completedAt),
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
  /** Food items subtotal before fees/tax/promo. */
  foodSubtotal?: number;
  tax?: number;
  taxRate?: number;
  deliveryFee?: number;
  serviceFee?: number;
  promoDiscount?: number;
  promoCode?: string | null;
  deliveryType?: 'delivery' | 'pickup';
  driverId?: string | null;
  deliveryLocation: { lat: number; lng: number; address: string };
  customerLocation?: CustomerLocationRecord;
  restaurantLocation?: LatLng | null;
  /** When true, always create a new doc (skip unpaid / pending reuse). */
  forceNew?: boolean;
  /**
   * DEV/E2E only: seed driver GPS on create (create rules allow it;
   * customer cannot patch driverLocation after create).
   */
  seedDriverLocation?: { latitude: number; longitude: number } | null;
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

  // ── Require real GPS from checkout (never invent 0,0) ──────────────────────
  assertOrderGps(
    payload.deliveryLocation.lat,
    payload.deliveryLocation.lng,
    'Delivery location',
  );

  let restaurantLocation: LatLng;
  if (
    payload.restaurantLocation &&
    isValidGpsCoordinates(payload.restaurantLocation.lat, payload.restaurantLocation.lng)
  ) {
    restaurantLocation = payload.restaurantLocation;
  } else {
    const restaurantRecord = await fetchRestaurantLocation(payload.restaurantId);
    restaurantLocation = restaurantLocationToLegacy(restaurantRecord);
  }
  assertOrderGps(
    restaurantLocation.lat,
    restaurantLocation.lng,
    'Restaurant location',
  );

  const deliveryLocationWrite = buildDeliveryLocationWrite(payload.deliveryLocation);
  const restaurantLocationWrite = buildRestaurantLocationWrite(restaurantLocation);

  const customerLat =
    payload.customerLocation &&
    isValidGpsCoordinates(
      payload.customerLocation.latitude,
      payload.customerLocation.longitude,
    )
      ? payload.customerLocation.latitude
      : deliveryLocationWrite.lat;
  const customerLng =
    payload.customerLocation &&
    isValidGpsCoordinates(
      payload.customerLocation.latitude,
      payload.customerLocation.longitude,
    )
      ? payload.customerLocation.longitude
      : deliveryLocationWrite.lng;
  assertOrderGps(customerLat, customerLng, 'Customer location');

  const customerLocationRecord: CustomerLocationRecord = {
    latitude: customerLat,
    longitude: customerLng,
    timestamp:
      payload.customerLocation?.timestamp != null
        ? payload.customerLocation.timestamp
        : serverTimestamp(),
  };
  const userLocation: LatLng = { lat: customerLat, lng: customerLng };

  try {
    if (payload.forceNew) {
      console.log('[ORDER CREATE] forceNew=true — skipping unpaid reuse');
    }
    const existingUnpaid = payload.forceNew
      ? null
      : await getDocs(
          query(
            collection(db, 'orders'),
            where('customerId', '==', customerUid),
            where('restaurantId', '==', payload.restaurantId),
            where('paymentStatus', '==', 'unpaid'),
            where('status', '==', 'awaiting_payment'),
            limit(1),
          ),
        );
    if (existingUnpaid && !existingUnpaid.empty) {
      // Reuse the unpaid order id, but NEVER keep a stale pre-promo total
      // or stale / missing delivery GPS from an earlier attempt.
      const existingDoc = existingUnpaid.docs[0];
      const existingData = existingDoc.data() as Record<string, unknown>;
      const checkoutFinalTotal =
        typeof payload.totalPrice === 'number' && Number.isFinite(payload.totalPrice)
          ? Math.round(Math.max(0, payload.totalPrice) * 100) / 100
          : null;

      const patch: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
        deliveryLocation: deliveryLocationWrite,
        deliveryAddress: deliveryLocationWrite.address,
        customerLocation: customerLocationRecord,
        userLocation,
        restaurantLocation: restaurantLocationWrite,
        deliveryType,
        // Prevent stale driver assignment from a prior unpaid attempt advancing lifecycle.
        driverId: null,
        assignedDriverId: null,
        driverLocation: null,
        driverName: null,
        driverPhone: null,
        driverVehicle: null,
        deliveryStatus: 'pending',
        status: 'awaiting_payment',
        paymentStatus: 'unpaid',
      };

      if (checkoutFinalTotal != null) {
        const priorTotalCad =
          typeof existingData.customerTotal === 'number'
            ? existingData.customerTotal
            : typeof existingData.total === 'number'
              ? existingData.total
              : typeof existingData.totalPrice === 'number'
                ? existingData.totalPrice
                : null;
        const priorCents =
          priorTotalCad != null ? Math.round(priorTotalCad * 100) : null;
        const checkoutCents = Math.round(checkoutFinalTotal * 100);
        patch.totalPrice = checkoutFinalTotal;
        patch.total = checkoutFinalTotal;
        patch.customerTotal = checkoutFinalTotal;
        if (typeof payload.foodSubtotal === 'number' && Number.isFinite(payload.foodSubtotal)) {
          patch.subtotal = payload.foodSubtotal;
        }
        if (typeof payload.tax === 'number' && Number.isFinite(payload.tax)) {
          patch.tax = payload.tax;
        }
        if (typeof payload.taxRate === 'number' && Number.isFinite(payload.taxRate)) {
          patch.taxRate = payload.taxRate;
        }
        if (typeof payload.deliveryFee === 'number' && Number.isFinite(payload.deliveryFee)) {
          patch.deliveryFee = Math.max(0, payload.deliveryFee);
        }
        if (typeof payload.serviceFee === 'number' && Number.isFinite(payload.serviceFee)) {
          patch.serviceFee = Math.max(0, payload.serviceFee);
        }
        if (typeof payload.promoDiscount === 'number' && Number.isFinite(payload.promoDiscount)) {
          patch.promoDiscount = Math.max(0, payload.promoDiscount);
        }
        if (priorCents != null && priorCents !== checkoutCents) {
          patch.paymentIntentId = null;
          patch.stripePaymentIntentId = null;
        }
        console.log(
          JSON.stringify({
            msg: 'createOrder_reuse_unpaid_sync_checkout_total',
            orderId: existingDoc.id,
            priorTotalCents: priorCents,
            checkoutFinalTotalCents: checkoutCents,
            clearedStalePaymentIntent: priorCents != null && priorCents !== checkoutCents,
          }),
        );
      }

      await rawUpdateOrder(existingDoc.id, patch, {
        fileName: 'services/orderService.ts',
        functionName: 'createOrder:reuseUnpaid',
      });

      console.log('[ORDER CREATE COORDS] reused unpaid order', {
        orderId: existingDoc.id,
        customerLocation: {
          latitude: customerLocationRecord.latitude,
          longitude: customerLocationRecord.longitude,
        },
        restaurantLocation: {
          latitude: restaurantLocationWrite.latitude,
          longitude: restaurantLocationWrite.longitude,
        },
        deliveryLocation: {
          latitude: deliveryLocationWrite.latitude,
          longitude: deliveryLocationWrite.longitude,
          address: deliveryLocationWrite.address,
        },
      });

      return existingDoc.id;
    }
  } catch {
    /* composite index may be missing — continue to create */
  }

  let existingOrderId: string | null = null;
  if (!payload.forceNew) {
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
  }
  const groupId = existingOrderId ? `grp_${existingOrderId}` : makeGroupId();
  const estimatedDeliveryTime = existingOrderId ? 25 : 35;

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
    /* profiles optional — keep snapshot fallbacks and still create order */
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
      customerLat: customerLat,
      customerLng: customerLng,
      restaurantData: restaurantRaw,
      restaurantCoords: restaurantLocation,
    });
    deliveryDistanceKm = zoneCheck.distanceKm;
    deliveryTier = zoneCheck.tier;
    deliveryEligible = true;
    maxDeliveryDistanceKmAtCheckout = zoneCheck.settings.maxDeliveryDistanceKm;
    if (deliveryType === 'delivery') {
      const resolvedDeliveryFee = resolveOrderDeliveryFee({
        deliveryType,
        restaurantData: restaurantRaw,
        settings: zoneCheck.settings,
        tier: zoneCheck.tier,
        distanceKm: zoneCheck.distanceKm,
        checkoutDeliveryFee: payload.deliveryFee ?? null,
      });
      // Prefer the fee Checkout displayed (incl. 0 for free_delivery).
      orderDeliveryFee =
        typeof payload.deliveryFee === 'number' && Number.isFinite(payload.deliveryFee)
          ? Math.max(0, payload.deliveryFee)
          : resolvedDeliveryFee;
    }
  } catch (zoneErr) {
    if (deliveryType === 'delivery') {
      throw zoneErr;
    }
  }

  const foodSubtotal =
    typeof payload.foodSubtotal === 'number' && Number.isFinite(payload.foodSubtotal)
      ? payload.foodSubtotal
      : payload.totalPrice;
  const serviceFee =
    typeof payload.serviceFee === 'number' && Number.isFinite(payload.serviceFee)
      ? payload.serviceFee
      : 0;
  const promoDiscount =
    typeof payload.promoDiscount === 'number' && Number.isFinite(payload.promoDiscount)
      ? payload.promoDiscount
      : 0;
  const taxRate = resolveRestaurantTaxRate(
    restaurantRaw,
    typeof payload.taxRate === 'number' && Number.isFinite(payload.taxRate)
      ? payload.taxRate
      : DEFAULT_TAX_RATE,
  );
  // Receipt charge totals: Checkout Final Total is the single source of truth.
  // Fee lines may be re-resolved for records, but totalPrice/total/customerTotal
  // must never diverge from what the customer saw on the Checkout screen.
  const pricing = computeOrderPricing({
    foodSubtotal,
    deliveryFee: orderDeliveryFee,
    serviceFee,
    promoDiscount,
    taxRate,
  });
  const checkoutFinalTotal =
    typeof payload.totalPrice === 'number' && Number.isFinite(payload.totalPrice)
      ? Math.round(Math.max(0, payload.totalPrice) * 100) / 100
      : null;
  const totalPaid = checkoutFinalTotal ?? pricing.totalPaid;
  if (
    checkoutFinalTotal != null &&
    Math.abs(checkoutFinalTotal - pricing.totalPaid) > 0.01
  ) {
    console.warn('[createOrder] checkout Final Total differs from recomputed fees', {
      checkoutFinalTotal,
      recomputed: pricing.totalPaid,
      foodSubtotal,
      orderDeliveryFee,
      serviceFee,
      promoDiscount,
      taxRate,
    });
  }
  const tax =
    checkoutFinalTotal != null &&
    Math.abs(checkoutFinalTotal - pricing.totalPaid) > 0.01
      ? Math.round(
          Math.max(
            0,
            totalPaid -
              (foodSubtotal + orderDeliveryFee + serviceFee - promoDiscount),
          ) * 100,
        ) / 100
      : pricing.hst;
  const receiptNumber = `HO-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  const orderPayload = {
    userId: customerUid,
    customerId: customerUid,
    restaurantId: payload.restaurantId,
    venueId: payload.restaurantId,
    items: payload.items,
    customerName: null,
    customerPhone: null,
    subtotal: foodSubtotal,
    tax,
    taxRate,
    deliveryFee: orderDeliveryFee,
    serviceFee,
    promoDiscount,
    promoCode: payload.promoCode ?? null,
    receiptNumber,
    deliveryDistanceKm,
    deliveryEligible,
    deliveryTier,
    maxDeliveryDistanceKmAtCheckout,
    totalPrice: totalPaid,
    total: totalPaid,
    customerTotal: totalPaid,
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
    driverId: payload.driverId ?? (payload.seedDriverLocation ? customerUid : null),
    assignedDriverId: payload.seedDriverLocation ? customerUid : null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverLocation: payload.seedDriverLocation
      ? {
          latitude: payload.seedDriverLocation.latitude,
          longitude: payload.seedDriverLocation.longitude,
          lat: payload.seedDriverLocation.latitude,
          lng: payload.seedDriverLocation.longitude,
          heading: null,
          speed: null,
          timestamp: serverTimestamp(),
        }
      : null,
    deliveryLocation: deliveryLocationWrite,
    deliveryAddress: deliveryLocationWrite.address,
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
    restaurantLocation: restaurantLocationWrite,
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

  console.log('[ORDER CREATE COORDS]', {
    orderId,
    customerLocation: {
      latitude: customerLocationRecord.latitude,
      longitude: customerLocationRecord.longitude,
    },
    restaurantLocation: {
      latitude: restaurantLocationWrite.latitude,
      longitude: restaurantLocationWrite.longitude,
    },
    deliveryLocation: {
      latitude: deliveryLocationWrite.latitude,
      longitude: deliveryLocationWrite.longitude,
      address: deliveryLocationWrite.address,
    },
  });

  try {
    const written = await getDocFromServer(doc(db, 'orders', orderId));
    const data = written.data() ?? {};
    const cl = (data.customerLocation ?? null) as Record<string, unknown> | null;
    const dl = (data.deliveryLocation ?? null) as Record<string, unknown> | null;
    const rl = (data.restaurantLocation ?? null) as Record<string, unknown> | null;
    console.log('[E2E VERIFY] FIRESTORE DOC AFTER createOrder()', {
      orderId,
      customerLocation: {
        latitude: cl?.latitude ?? cl?.lat ?? null,
        longitude: cl?.longitude ?? cl?.lng ?? null,
        raw: cl,
      },
      deliveryLocation: {
        latitude: dl?.latitude ?? dl?.lat ?? null,
        longitude: dl?.longitude ?? dl?.lng ?? null,
        raw: dl,
      },
      restaurantLocation: {
        latitude: rl?.latitude ?? rl?.lat ?? null,
        longitude: rl?.longitude ?? rl?.lng ?? null,
        raw: rl,
      },
      driverLocation: data.driverLocation ?? null,
    });
  } catch (err) {
    console.warn('[E2E VERIFY] failed to re-read order after createOrder', err);
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
  const queryGate = new QuerySnapshotFreshnessGate();
  const unsub = onSnapshot(
    getActiveRestaurantOrdersQuery(restaurantId),
    (snap) => {
      if (!queryGate.shouldApply(snap.metadata.fromCache, snap.docs.length)) {
        console.log('CACHE ORDER', {
          source: 'subscribeActiveRestaurantOrders:ignored',
          restaurantId,
          docCount: snap.docs.length,
          fromCache: true,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
        return;
      }
      console.log('SERVER ORDER', {
        source: 'subscribeActiveRestaurantOrders',
        restaurantId,
        docCount: snap.docs.length,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
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
  const queryGate = new QuerySnapshotFreshnessGate();
  const unsub = onSnapshot(
    getRestaurantArchivedOrdersQuery(restaurantId),
    (snap) => {
      if (!queryGate.shouldApply(snap.metadata.fromCache, snap.docs.length)) {
        console.log('CACHE ORDER', {
          source: 'subscribeRestaurantArchivedOrders:ignored',
          restaurantId,
          docCount: snap.docs.length,
          fromCache: true,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
        return;
      }
      console.log('SERVER ORDER', {
        source: 'subscribeRestaurantArchivedOrders',
        restaurantId,
        docCount: snap.docs.length,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
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
    const currentSnap = await getDoc(doc(db, 'orders', orderId));
    const currentData = currentSnap.exists()
      ? ({ id: orderId, ...(currentSnap.data() as Record<string, unknown>) } as Record<string, unknown>)
      : { id: orderId };
    const { writeMarketplaceDeliveryCompletion } = await import(
      '@/lib/marketplaceDeliveryCompletion'
    );
    await writeMarketplaceDeliveryCompletion(
      orderId,
      currentData,
      { fileName: 'orderService.ts', functionName: 'updateOrderStatus' },
      'orderService.ts#updateOrderStatus',
    );
    return;
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
 * Bootstraps with getDocFromServer, then listens with completion-locked freshness gate.
 */
export function subscribeCustomerOrderById(
  orderId: string,
  onData: (order: RestaurantOrder | null) => void,
  options?: { onListenError?: (err: Error) => void },
): Unsubscribe {
  const id = orderId.trim();
  if (!id) {
    onData(null);
    return () => {};
  }

  if (__DEV__) {
    console.log('[subscribeCustomerOrderById] listening', { documentPath: `orders/${id}` });
  }

  const orderRef = doc(db, 'orders', id);
  const listenerInstanceId = `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  registerCustomerOrderListener(id, listenerInstanceId);

  let cancelled = false;
  let lastSignature = '';
  let lastEmittedOrder: RestaurantOrder | null = null;
  let lastEmittedUpdatedAtMs = 0;
  let lastEmittedCourierRank = 0;
  let completionLocked = false;
  let serverBootstrapDone = false;
  let serverRefreshInFlight = false;
  let unsub: Unsubscribe | null = null;
  const freshnessGate = new OrderSnapshotFreshnessGate();

  const scheduleServerRefresh = (reason: string) => {
    if (serverRefreshInFlight || cancelled) return;
    serverRefreshInFlight = true;
    if (__DEV__) {
      console.log('[subscribeCustomerOrderById] server refresh', { orderId: id, reason });
    }
    void getDocFromServer(orderRef)
      .then((serverSnap) => {
        if (cancelled) return;
        emitSnapshot(serverSnap, 'server_refresh');
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn('[subscribeCustomerOrderById] server refresh failed', orderId, err);
        }
      })
      .finally(() => {
        serverRefreshInFlight = false;
      });
  };

  const emitSnapshot = (
    snap: DocumentSnapshot,
    ingress: 'bootstrap' | 'listener' | 'server_refresh' = 'listener',
  ) => {
    if (cancelled) return;
    if (!snap.exists()) {
      onData(null);
      lastSignature = '';
      lastEmittedOrder = null;
      lastEmittedUpdatedAtMs = 0;
      lastEmittedCourierRank = 0;
      completionLocked = false;
      return;
    }
    try {
      const raw = snap.data() as Record<string, unknown>;
      const meta = {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        source: 'subscribeCustomerOrderById' as const,
        listenerInstanceId,
      };
      logCustomerRawDoc(snap.id, raw, 'listener');
      const updatedAtMs = resolveOrderUpdatedAtMs(raw);

      logRawFirestoreCustomerDoc(snap.id, raw, meta);

      if (!serverBootstrapDone && meta.fromCache && ingress !== 'bootstrap') {
        logCustomerTrackingSnapshot(snap.id, raw, meta, 'ignored_stale');
        scheduleServerRefresh('cache_before_bootstrap');
        return;
      }

      if (ingress === 'bootstrap' || !meta.fromCache) {
        serverBootstrapDone = true;
        freshnessGate.markServerBootstrap();
      }

      const currentState = {
        lastCourierRank: lastEmittedCourierRank,
        lastUpdatedAtMs: lastEmittedUpdatedAtMs,
        hasServerSnapshot: serverBootstrapDone,
        completionLocked,
        currentStatus: lastEmittedOrder?.status ?? null,
        currentDeliveryStatus: lastEmittedOrder?.deliveryStatus ?? null,
      };

      const gateDecision = evaluateCustomerSnapshotFreshness(raw, meta, currentState);

      if (!gateDecision.apply) {
        logCustomerSnapshotRejected(
          snap.id,
          raw,
          {
            updatedAtMs: lastEmittedUpdatedAtMs,
            deliveryStatus: lastEmittedOrder?.deliveryStatus ?? null,
            status: lastEmittedOrder?.status ?? null,
          },
          gateDecision.reason,
          { fromCache: meta.fromCache, source: meta.source },
        );
        logServerOrCacheOrder(snap.id, raw, meta, `subscribeCustomerOrderById:ignored:${gateDecision.reason}`);
        logCustomerTrackingSnapshot(snap.id, raw, { ...meta, freshnessReason: gateDecision.reason }, 'ignored_stale');
        if (lastEmittedOrder) {
          logCustomerTrackingUi(snap.id, lastEmittedOrder, meta.source);
          onData(lastEmittedOrder);
        }
        scheduleServerRefresh(gateDecision.reason);
        return;
      }

      logServerOrCacheOrder(snap.id, raw, meta, 'subscribeCustomerOrderById');
      logCustomerTrackingSnapshot(snap.id, raw, meta, 'applied');
      logStatusRead(snap.id, raw.deliveryStatus ?? null, raw.status ?? null, {
        source: meta.source,
        fromCache: meta.fromCache,
        hasPendingWrites: meta.hasPendingWrites,
      });

      const mapped = mapDocToRestaurantOrder(snap);
      const mappedRank = resolveDeliveryStageRank(mapped);
      const mappedUpdatedAtMs = resolveOrderUpdatedAtMs(raw);
      const lastRank = lastEmittedOrder ? resolveDeliveryStageRank(lastEmittedOrder) : 0;
      if (
        lastEmittedOrder &&
        (completionLocked && !isOrderCompleted(mapped) ||
          isDeliveryStageRegression(lastRank, mappedRank))
      ) {
        logCustomerSnapshotRejected(
          snap.id,
          raw,
          {
            updatedAtMs: lastEmittedUpdatedAtMs,
            deliveryStatus: lastEmittedOrder.deliveryStatus,
            status: lastEmittedOrder.status,
          },
          'emit_regression_blocked',
          { fromCache: meta.fromCache, source: meta.source },
        );
        logCustomerTrackingSnapshot(snap.id, raw, meta, 'regression_blocked');
        logCustomerTrackingUi(snap.id, lastEmittedOrder, meta.source);
        onData(lastEmittedOrder);
        scheduleServerRefresh('emit_regression_blocked');
        return;
      }

      const forceEmit = isOrderCompleted(mapped);
      const signature = customerOrderSnapshotSignature(raw);
      if (!forceEmit && signature === lastSignature) {
        logCustomerTrackingSnapshot(snap.id, raw, meta, 'signature_dedup');
        return;
      }
      lastSignature = signature;
      lastEmittedOrder = mapped;
      lastEmittedUpdatedAtMs =
        mappedUpdatedAtMs > 0
          ? Math.max(lastEmittedUpdatedAtMs, mappedUpdatedAtMs)
          : lastEmittedUpdatedAtMs;
      lastEmittedCourierRank = Math.max(lastEmittedCourierRank, mappedRank);
      if (isOrderCompleted(mapped)) {
        completionLocked = true;
      }
      freshnessGate.seedFromEmitted(raw);

      logCustomerOrderSnapshot(snap.id, raw, meta);
      logCustomerOrderPipeline('subscribeCustomerOrderById', snap.id, raw, mapped, {
        fromCache: meta.fromCache,
        hasPendingWrites: meta.hasPendingWrites,
      });
      logCustomerTrackingUi(snap.id, mapped, meta.source);
      onData(mapped);

      if (meta.fromCache && !isOrderCompleted(raw)) {
        scheduleServerRefresh('post_cache_emit');
      }
    } catch (e) {
      console.warn('[subscribeCustomerOrderById] mapDoc failed', orderId, e);
      options?.onListenError?.(e instanceof Error ? e : new Error(String(e)));
    }
  };

  void getDocFromServer(orderRef)
    .then((snap) => {
      if (cancelled) return;
      emitSnapshot(snap, 'bootstrap');
    })
    .catch((err) => {
      if (cancelled) return;
      console.warn('[subscribeCustomerOrderById] getDocFromServer failed', orderId, err);
      serverBootstrapDone = true;
      options?.onListenError?.(err instanceof Error ? err : new Error(String(err)));
    });

  unsub = onSnapshot(
    orderRef,
    { includeMetadataChanges: true },
    (snap) => emitSnapshot(snap, 'listener'),
    (err) => {
      if (cancelled) return;
      console.warn('[subscribeCustomerOrderById] listener error', orderId, err);
      options?.onListenError?.(err);
    },
  );

  return () => {
    cancelled = true;
    unsub?.();
    unregisterCustomerOrderListener(id, listenerInstanceId);
  };
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
