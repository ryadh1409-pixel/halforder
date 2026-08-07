/**
 * adminEmoOrdersService.ts
 *
 * Firestore service for Emo AI "I Want Something" orders (admin only).
 * Filters: orderSource === 'emo_concierge'
 *
 * COMPLETELY isolated from Food Share / Pick Up order tables.
 * Zero reads from adminFoodShares, matchQueues, or any Food Share collection.
 */

import { db } from '@/services/firebase';
import {
  I_WANT_ORDER_SOURCE,
  I_WANT_ORDER_TYPE,
} from '@/types/iWant';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { safeToMillis } from '@/utils/safeToMillis';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AdminEmoOrderStatus =
  | 'awaiting_payment'
  | 'payment_confirmed'
  | 'searching_driver'
  | 'driver_assigned'
  | 'picking_up'
  | 'on_the_way'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | string;

export type AdminEmoOrderPaymentStatus =
  | 'unpaid'
  | 'paid'
  | 'succeeded'
  | 'refunded'
  | 'failed'
  | string;

export type AdminEmoOrder = {
  id: string;
  // Customer
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAvatar: string | null;
  deliveryAddress: string | null;
  // Restaurant
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string | null;
  restaurantLat: number | null;
  restaurantLng: number | null;
  googleMapsUrl: string | null;
  // Meal
  mealName: string;
  mealNotes: string | null;
  quantity: number;
  estimatedMealPrice: number;
  // Financial
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  receiptNumber: string | null;
  // Status
  status: AdminEmoOrderStatus;
  deliveryStatus: string | null;
  paymentStatus: AdminEmoOrderPaymentStatus;
  // Payment
  stripePaymentIntentId: string | null;
  checkoutSessionId: string | null;
  // Driver
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicle: string | null;
  // Timestamps (ms)
  createdAtMs: number | null;
  updatedAtMs: number | null;
  acceptedAtMs: number | null;
  preparedAtMs: number | null;
  pickedUpAtMs: number | null;
  deliveredAtMs: number | null;
  // Location
  deliveryLat: number | null;
  deliveryLng: number | null;
  // City (derived from address)
  city: string | null;
  // Source markers
  orderSource: string;
  type: string | null;
};

export type AdminEmoOrderAnalytics = {
  activeOrders: number;
  completedToday: number;
  pendingPayments: number;
  searchingDriver: number;
  delivering: number;
  completed: number;
  cancelled: number;
  total: number;
};

export type EmoOrderSortKey = 'newest' | 'oldest' | 'status' | 'payment' | 'restaurant';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function normNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toMs(v: unknown): number | null {
  return safeToMillis(v) ?? null;
}

function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  // "123 Main St, Ottawa, ON K1A 0A6" → "Ottawa"
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // Second-to-last or second segment is usually city
    const candidate = parts.length >= 3 ? parts[1] : parts[0];
    return candidate?.replace(/\b[A-Z]{1,2}\b/g, '').replace(/\d+/g, '').trim() || null;
  }
  return null;
}

/** Map a raw Firestore doc to AdminEmoOrder. */
export function mapEmoOrderDoc(
  id: string,
  data: Record<string, unknown>,
): AdminEmoOrder {
  const deliveryAddress = normStr(data.deliveryAddress, null as unknown as string) || null;
  const restaurantObj =
    data.restaurant && typeof data.restaurant === 'object'
      ? (data.restaurant as Record<string, unknown>)
      : null;
  const customerObj =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : null;
  const driverObj =
    data.driver && typeof data.driver === 'object'
      ? (data.driver as Record<string, unknown>)
      : null;
  const deliveryLoc =
    data.deliveryLocation && typeof data.deliveryLocation === 'object'
      ? (data.deliveryLocation as Record<string, unknown>)
      : null;
  const restaurantLoc =
    data.restaurantLocation && typeof data.restaurantLocation === 'object'
      ? (data.restaurantLocation as Record<string, unknown>)
      : null;

  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const firstItem = items[0] ?? {};
  const mealName =
    normStr(data.mealName, null as unknown as string) ||
    normStr(firstItem.name, 'Unknown meal');

  return {
    id,
    // Customer
    customerId: normStr(data.customerId, normStr(data.userId)),
    customerName:
      normStr(data.customerName, null as unknown as string) ||
      normStr(customerObj?.name, null as unknown as string) ||
      null,
    customerEmail: normStr(data.customerEmail, null as unknown as string) || null,
    customerPhone:
      normStr(data.customerPhone, null as unknown as string) ||
      normStr(customerObj?.phone, null as unknown as string) ||
      null,
    customerAvatar:
      normStr(data.customerAvatar, null as unknown as string) ||
      normStr(customerObj?.avatar, null as unknown as string) ||
      null,
    deliveryAddress,
    // Restaurant
    restaurantId: normStr(data.restaurantId, normStr(data.venueId, 'unknown')),
    restaurantName:
      normStr(restaurantObj?.name, null as unknown as string) ||
      normStr(data.restaurantName, 'Unknown restaurant'),
    restaurantAddress:
      normStr(restaurantObj?.address, null as unknown as string) ||
      normStr(data.restaurantAddress, null as unknown as string) ||
      null,
    restaurantLat:
      typeof restaurantObj?.latitude === 'number' ? restaurantObj.latitude :
      typeof restaurantLoc?.lat === 'number' ? restaurantLoc.lat : null,
    restaurantLng:
      typeof restaurantObj?.longitude === 'number' ? restaurantObj.longitude :
      typeof restaurantLoc?.lng === 'number' ? restaurantLoc.lng : null,
    googleMapsUrl: normStr(data.googleMapsUrl, null as unknown as string) || null,
    // Meal
    mealName,
    mealNotes: normStr(data.notes, null as unknown as string) || normStr(data.customerNotes, null as unknown as string) || null,
    quantity: normNum(firstItem.qty, 1),
    estimatedMealPrice: normNum(data.estimatedMealPrice, normNum(firstItem.price)),
    // Financial
    subtotal: normNum(data.subtotal),
    deliveryFee: normNum(data.deliveryFee),
    serviceFee: normNum(data.serviceFee),
    tax: normNum(data.tax, normNum(data.taxes)),
    total: normNum(data.total, normNum(data.totalPrice)),
    receiptNumber: normStr(data.receiptNumber, null as unknown as string) || null,
    // Status
    status: normStr(data.status, 'unknown') as AdminEmoOrderStatus,
    deliveryStatus: normStr(data.deliveryStatus, null as unknown as string) || null,
    paymentStatus: normStr(data.paymentStatus, 'unknown') as AdminEmoOrderPaymentStatus,
    // Payment
    stripePaymentIntentId:
      normStr(data.stripePaymentIntentId, null as unknown as string) ||
      normStr(data.paymentIntentId, null as unknown as string) ||
      null,
    checkoutSessionId: normStr(data.checkoutSessionId, null as unknown as string) || null,
    // Driver
    driverId:
      normStr(data.driverId, null as unknown as string) ||
      normStr(data.assignedDriverId, null as unknown as string) ||
      normStr(driverObj?.id, null as unknown as string) ||
      null,
    driverName:
      normStr(data.driverName, null as unknown as string) ||
      normStr(driverObj?.name, null as unknown as string) ||
      null,
    driverPhone:
      normStr(data.driverPhone, null as unknown as string) ||
      normStr(driverObj?.phone, null as unknown as string) ||
      null,
    driverVehicle:
      normStr(data.driverVehicle, null as unknown as string) ||
      normStr(driverObj?.vehicle, null as unknown as string) ||
      null,
    // Timestamps
    createdAtMs: toMs(data.createdAt),
    updatedAtMs: toMs(data.updatedAt),
    acceptedAtMs: toMs(data.acceptedAt),
    preparedAtMs: toMs(data.preparedAt),
    pickedUpAtMs: toMs(data.pickedUpAt),
    deliveredAtMs: toMs(data.deliveredAt),
    // Delivery location
    deliveryLat:
      typeof deliveryLoc?.lat === 'number' ? deliveryLoc.lat : null,
    deliveryLng:
      typeof deliveryLoc?.lng === 'number' ? deliveryLoc.lng : null,
    // City
    city: cityFromAddress(deliveryAddress),
    // Source markers
    orderSource: normStr(data.orderSource, I_WANT_ORDER_SOURCE),
    type: normStr(data.type, null as unknown as string) || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real-time listener for all Emo AI concierge orders.
 * Filtered: orderSource === 'emo_concierge'
 * Sorted server-side by createdAt descending.
 */
export function subscribeEmoOrders(
  onData: (orders: AdminEmoOrder[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'orders'),
    where('orderSource', '==', I_WANT_ORDER_SOURCE),
    orderBy('createdAt', 'desc'),
  );

  console.log('[AdminEmoOrders] subscribing to orders where orderSource ==', I_WANT_ORDER_SOURCE);

  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs.map((d) =>
        mapEmoOrderDoc(d.id, d.data() as Record<string, unknown>),
      );
      console.log('[AdminEmoOrders] snapshot received:', orders.length, 'orders');
      onData(orders);
    },
    (err) => {
      console.error('[AdminEmoOrders] listener error:', err);
      onError?.(err);
      onData([]);
    },
  );
}

/**
 * Real-time listener for a single Emo AI order by ID.
 */
export function subscribeEmoOrder(
  orderId: string,
  onData: (order: AdminEmoOrder | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  console.log('[AdminEmoOrders] subscribing to order:', orderId);

  return onSnapshot(
    doc(db, 'orders', orderId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      // Verify it's an Emo AI order before returning
      if (
        data.orderSource !== I_WANT_ORDER_SOURCE &&
        data.type !== I_WANT_ORDER_TYPE
      ) {
        console.warn('[AdminEmoOrders] order', orderId, 'is not an emo_concierge order');
        onData(null);
        return;
      }
      onData(mapEmoOrderDoc(snap.id, data));
    },
    (err) => {
      console.error('[AdminEmoOrders] single order listener error:', err);
      onError?.(err);
      onData(null);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeEmoOrderAnalytics(orders: AdminEmoOrder[]): AdminEmoOrderAnalytics {
  const todayStart = startOfTodayMs();

  let activeOrders = 0;
  let completedToday = 0;
  let pendingPayments = 0;
  let searchingDriver = 0;
  let delivering = 0;
  let completed = 0;
  let cancelled = 0;

  for (const o of orders) {
    const s = o.status.toLowerCase();
    const ds = (o.deliveryStatus ?? '').toLowerCase();
    const ps = o.paymentStatus.toLowerCase();

    // Pending payment
    if (ps === 'unpaid' || s === 'awaiting_payment') {
      pendingPayments += 1;
    }

    // Searching for driver
    if (s === 'searching_driver' || s === 'payment_confirmed' || ds === 'searching_driver') {
      searchingDriver += 1;
    }

    // Delivering (driver assigned or on the way)
    if (
      ['driver_assigned', 'picking_up', 'on_the_way', 'en_route_to_customer'].includes(s) ||
      ['driver_assigned', 'picking_up', 'on_the_way', 'picked_up', 'en_route_to_customer'].includes(ds)
    ) {
      delivering += 1;
    }

    // Completed
    if (s === 'completed' || s === 'delivered' || ds === 'delivered') {
      completed += 1;
      const ms = o.deliveredAtMs ?? o.createdAtMs ?? 0;
      if (ms >= todayStart) completedToday += 1;
    }

    // Cancelled
    if (s === 'cancelled' || s === 'canceled') {
      cancelled += 1;
    }

    // Active (anything in-flight)
    if (
      !['completed', 'delivered', 'cancelled', 'canceled', 'awaiting_payment'].includes(s)
    ) {
      activeOrders += 1;
    }
  }

  return {
    activeOrders,
    completedToday,
    pendingPayments,
    searchingDriver,
    delivering,
    completed,
    cancelled,
    total: orders.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting + Filtering
// ─────────────────────────────────────────────────────────────────────────────

export function sortEmoOrders(
  orders: AdminEmoOrder[],
  sort: EmoOrderSortKey,
): AdminEmoOrder[] {
  const copy = [...orders];
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
    case 'oldest':
      return copy.sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
    case 'status':
      return copy.sort((a, b) => a.status.localeCompare(b.status));
    case 'payment':
      return copy.sort((a, b) => a.paymentStatus.localeCompare(b.paymentStatus));
    case 'restaurant':
      return copy.sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
    default:
      return copy;
  }
}

export function filterEmoOrders(
  orders: AdminEmoOrder[],
  opts: {
    search?: string;
    status?: string;
    paymentStatus?: string;
    city?: string;
    dateFrom?: number | null;
    dateTo?: number | null;
  },
): AdminEmoOrder[] {
  let result = orders;

  if (opts.search) {
    const q = opts.search.toLowerCase().trim();
    result = result.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        (o.customerName?.toLowerCase().includes(q) ?? false) ||
        (o.customerEmail?.toLowerCase().includes(q) ?? false) ||
        o.restaurantName.toLowerCase().includes(q) ||
        o.mealName.toLowerCase().includes(q) ||
        (o.driverName?.toLowerCase().includes(q) ?? false) ||
        (o.receiptNumber?.toLowerCase().includes(q) ?? false),
    );
  }

  if (opts.status && opts.status !== 'all') {
    result = result.filter((o) => o.status === opts.status);
  }

  if (opts.paymentStatus && opts.paymentStatus !== 'all') {
    result = result.filter((o) => o.paymentStatus === opts.paymentStatus);
  }

  if (opts.city) {
    const c = opts.city.toLowerCase().trim();
    result = result.filter((o) => o.city?.toLowerCase().includes(c) ?? false);
  }

  if (opts.dateFrom != null) {
    result = result.filter((o) => (o.createdAtMs ?? 0) >= opts.dateFrom!);
  }

  if (opts.dateTo != null) {
    result = result.filter((o) => (o.createdAtMs ?? 0) <= opts.dateTo!);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatEmoOrderStatus(status: AdminEmoOrderStatus): string {
  const map: Record<string, string> = {
    awaiting_payment: 'Awaiting Payment',
    payment_confirmed: 'Payment Confirmed',
    searching_driver: 'Searching Driver',
    driver_assigned: 'Driver Assigned',
    picking_up: 'Picking Up',
    on_the_way: 'On the Way',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
  };
  return map[status] ?? status;
}

export function emoOrderStatusColor(
  status: AdminEmoOrderStatus,
  colors: { accentGreen: string; accentAmber: string; accentRed: string; primary: string; meta: string },
): string {
  switch (status) {
    case 'completed':
    case 'delivered':
      return colors.accentGreen;
    case 'searching_driver':
    case 'driver_assigned':
    case 'picking_up':
    case 'on_the_way':
      return colors.primary;
    case 'payment_confirmed':
      return colors.accentAmber;
    case 'awaiting_payment':
      return colors.accentAmber;
    case 'cancelled':
    case 'canceled':
      return colors.accentRed;
    default:
      return colors.meta;
  }
}

export function formatEmoTs(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
