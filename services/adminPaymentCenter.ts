import { db } from '@/services/firebase';
import type {
  AdminPaymentDateFilter,
  AdminPaymentSummary,
  AdminPaymentTransaction,
  AdminRevenueBucket,
  AdminTopFoodCard,
  AdminTopRestaurant,
  PaymentTransactionStatus,
} from '@/types/adminPaymentTransaction';
import { safeToMillis } from '@/utils/safeToMillis';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

function normStatus(value: unknown): PaymentTransactionStatus {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'paid' || s === 'succeeded') return 'paid';
  if (s === 'refunded') return 'refunded';
  if (s === 'disputed') return 'disputed';
  if (s === 'failed') return 'failed';
  return 'pending';
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeBrand(raw: string | null): string | null {
  if (!raw) return null;
  const brand = raw.trim().toLowerCase();
  if (!brand) return null;
  if (brand === 'amex' || brand === 'american express') return 'Amex';
  if (brand === 'mastercard') return 'Mastercard';
  if (brand === 'visa') return 'Visa';
  if (brand === 'discover') return 'Discover';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function formatCardLabel(brand: string | null, last4: string | null): string | null {
  const normalized = normalizeBrand(brand);
  if (!normalized && !last4) return null;
  return `${normalized ?? 'Card'} **** ${last4 ?? '????'}`;
}

function mapPaymentTransactionDoc(
  id: string,
  data: Record<string, unknown>,
): AdminPaymentTransaction {
  const brand = readString(data.paymentMethodBrand) || null;
  const last4 = readString(data.paymentMethodLast4) || null;
  return {
    id,
    createdAtMs: safeToMillis(data.createdAt),
    paidAtMs: safeToMillis(data.paidAt),
    stripePaymentIntentId: readString(data.stripePaymentIntentId, id),
    stripeChargeId: readString(data.stripeChargeId) || null,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    currency: readString(data.currency, 'cad').toLowerCase(),
    platformFee: typeof data.platformFee === 'number' ? data.platformFee : 0,
    deliveryFee: typeof data.deliveryFee === 'number' ? data.deliveryFee : 0,
    foodAmount: typeof data.foodAmount === 'number' ? data.foodAmount : 0,
    stripeFee: typeof data.stripeFee === 'number' ? data.stripeFee : 0,
    netRevenue:
      typeof data.netRevenue === 'number'
        ? data.netRevenue
        : typeof data.amount === 'number'
          ? data.amount
          : 0,
    customerId: readString(data.customerId, data.userId),
    customerName: readString(data.customerName) || null,
    partnerId: readString(data.partnerId) || null,
    partnerName: readString(data.partnerName) || null,
    adminFoodShareId: readString(data.adminFoodShareId) || null,
    adminFoodShareName: readString(data.adminFoodShareName, data.foodName) || null,
    adminFoodShareImage: readString(data.adminFoodShareImage, data.image) || null,
    matchId: readString(data.matchId) || null,
    orderId: readString(data.orderId) || null,
    restaurantId: readString(data.restaurantId) || null,
    restaurantName: readString(data.restaurantName) || null,
    driverId: readString(data.driverId) || null,
    driverName: readString(data.driverName) || null,
    status: normStatus(data.status ?? data.paymentStatus),
    paymentMethodBrand: brand,
    paymentMethodLast4: last4,
    paymentMethodLabel:
      readString(data.paymentMethodLabel) || formatCardLabel(brand, last4),
    receiptUrl: readString(data.receiptUrl) || null,
    source:
      readString(data.source, data.type) === 'food_share' ? 'food_share' : 'marketplace',
  };
}

function mapLegacyPaymentDoc(
  id: string,
  data: Record<string, unknown>,
): AdminPaymentTransaction | null {
  const stripePaymentIntentId = readString(data.stripePaymentIntentId);
  if (!stripePaymentIntentId) return null;
  const amountCents = typeof data.amount === 'number' ? data.amount : 0;
  const amount = amountCents / 100;
  const foodAmount = typeof data.foodShareCostCents === 'number'
    ? data.foodShareCostCents / 100
    : amount;
  const deliveryFee = typeof data.deliveryShareCostCents === 'number'
    ? data.deliveryShareCostCents / 100
    : 0;
  const platformFee = typeof data.platformFeeCents === 'number'
    ? data.platformFeeCents / 100
    : 0;
  return {
    id: stripePaymentIntentId,
    createdAtMs: safeToMillis(data.createdAt),
    paidAtMs: safeToMillis(data.paidAt),
    stripePaymentIntentId,
    stripeChargeId: null,
    amount,
    currency: readString(data.currency, 'cad').toLowerCase(),
    platformFee,
    deliveryFee,
    foodAmount,
    stripeFee: 0,
    netRevenue: amount,
    customerId: readString(data.userId, data.customerId),
    customerName: null,
    partnerId: null,
    partnerName: null,
    adminFoodShareId: readString(data.adminFoodShareId) || null,
    adminFoodShareName: null,
    adminFoodShareImage: null,
    matchId: readString(data.matchId) || null,
    orderId: readString(data.matchId) || null,
    restaurantId: readString(data.adminFoodShareId) || null,
    restaurantName: null,
    driverId: null,
    driverName: null,
    status: normStatus(data.paymentStatus),
    paymentMethodBrand: readString(data.paymentMethodBrand) || null,
    paymentMethodLast4: readString(data.paymentMethodLast4) || null,
    paymentMethodLabel:
      readString(data.paymentMethodLabel) ||
      formatCardLabel(
        readString(data.paymentMethodBrand) || null,
        readString(data.paymentMethodLast4) || null,
      ),
    receiptUrl: null,
    source: 'food_share',
  };
}

export function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeekMs(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonthMs(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function filterStartMs(filter: AdminPaymentDateFilter): number {
  if (filter === 'today') return startOfTodayMs();
  if (filter === '7d') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (filter === '30d') return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export async function fetchAdminPaymentTransactions(): Promise<
  AdminPaymentTransaction[]
> {
  const [txSnap, legacySnap] = await Promise.all([
    getDocs(query(collection(db, 'paymentTransactions'), orderBy('createdAt', 'desc'))),
    getDocs(collection(db, 'payments')),
  ]);

  const byId = new Map<string, AdminPaymentTransaction>();
  for (const docSnap of txSnap.docs) {
    byId.set(
      docSnap.id,
      mapPaymentTransactionDoc(docSnap.id, docSnap.data() as Record<string, unknown>),
    );
  }
  for (const docSnap of legacySnap.docs) {
    const mapped = mapLegacyPaymentDoc(
      docSnap.id,
      docSnap.data() as Record<string, unknown>,
    );
    if (mapped && !byId.has(mapped.id)) {
      byId.set(mapped.id, mapped);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (b.paidAtMs ?? b.createdAtMs ?? 0) - (a.paidAtMs ?? a.createdAtMs ?? 0),
  );
}

export function summarizeAdminPayments(
  rows: AdminPaymentTransaction[],
): AdminPaymentSummary {
  const todayStart = startOfTodayMs();
  const weekStart = startOfWeekMs();
  const monthStart = startOfMonthMs();
  let grossRevenue = 0;
  let revenueToday = 0;
  let revenueThisWeek = 0;
  let revenueThisMonth = 0;
  let pendingCount = 0;
  let successfulCount = 0;
  let refundedCount = 0;
  let disputedCount = 0;
  let failedCount = 0;
  let foodShareRevenue = 0;
  let deliveryRevenue = 0;
  let platformFees = 0;

  for (const row of rows) {
    const paidMs = row.paidAtMs ?? row.createdAtMs ?? 0;
    if (row.status === 'paid') {
      grossRevenue += row.amount;
      platformFees += row.platformFee;
      deliveryRevenue += row.deliveryFee;
      if (row.source === 'food_share') foodShareRevenue += row.amount;
      successfulCount += 1;
      if (paidMs >= todayStart) revenueToday += row.amount;
      if (paidMs >= weekStart) revenueThisWeek += row.amount;
      if (paidMs >= monthStart) revenueThisMonth += row.amount;
    } else if (row.status === 'pending') {
      pendingCount += 1;
    } else if (row.status === 'refunded') {
      refundedCount += 1;
    } else if (row.status === 'disputed') {
      disputedCount += 1;
    } else if (row.status === 'failed') {
      failedCount += 1;
    }
  }

  return {
    grossRevenue,
    revenueToday,
    revenueThisWeek,
    revenueThisMonth,
    pendingCount,
    successfulCount,
    refundedCount,
    disputedCount,
    failedCount,
    foodShareRevenue,
    deliveryRevenue,
    platformFees,
  };
}

export function filterAdminPayments(
  rows: AdminPaymentTransaction[],
  filter: AdminPaymentDateFilter,
  search: string,
): AdminPaymentTransaction[] {
  const startMs = filterStartMs(filter);
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    const ms = row.paidAtMs ?? row.createdAtMs ?? 0;
    if (startMs > 0 && ms < startMs) return false;
    if (!q) return true;
    const haystack = [
      row.customerName,
      row.customerId,
      row.orderId,
      row.matchId,
      row.stripePaymentIntentId,
      row.adminFoodShareName,
      row.restaurantName,
      row.partnerName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function buildDailyRevenueBuckets(
  rows: AdminPaymentTransaction[],
  days = 14,
): AdminRevenueBucket[] {
  const buckets: AdminRevenueBucket[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let revenue = 0;
    let count = 0;
    for (const row of rows) {
      if (row.status !== 'paid') continue;
      const ms = row.paidAtMs ?? row.createdAtMs ?? 0;
      if (ms >= start && ms < end) {
        revenue += row.amount;
        count += 1;
      }
    }
    buckets.push({ label, revenue, count });
  }
  return buckets;
}

export function buildTopFoodCards(rows: AdminPaymentTransaction[]): AdminTopFoodCard[] {
  const map = new Map<string, AdminTopFoodCard>();
  for (const row of rows) {
    if (row.status !== 'paid' || !row.adminFoodShareId) continue;
    const prev = map.get(row.adminFoodShareId);
    if (prev) {
      prev.revenue += row.amount;
      prev.count += 1;
    } else {
      map.set(row.adminFoodShareId, {
        adminFoodShareId: row.adminFoodShareId,
        name: row.adminFoodShareName ?? `Card ${row.adminFoodShareId}`,
        image: row.adminFoodShareImage,
        revenue: row.amount,
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
}

export function buildTopRestaurants(
  rows: AdminPaymentTransaction[],
): AdminTopRestaurant[] {
  const map = new Map<string, AdminTopRestaurant>();
  for (const row of rows) {
    if (row.status !== 'paid' || !row.restaurantId) continue;
    const prev = map.get(row.restaurantId);
    if (prev) {
      prev.revenue += row.amount;
      prev.count += 1;
    } else {
      map.set(row.restaurantId, {
        restaurantId: row.restaurantId,
        name: row.restaurantName ?? row.restaurantId,
        revenue: row.amount,
        count: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
}

export function formatPaymentCard(row: AdminPaymentTransaction): string {
  return row.paymentMethodLabel ?? formatCardLabel(row.paymentMethodBrand, row.paymentMethodLast4) ?? '—';
}

export function paymentTransactionsToCsv(rows: AdminPaymentTransaction[]): string {
  const header = [
    'Date',
    'Time',
    'Customer',
    'Amount',
    'Status',
    'Order',
    'Match',
    'PaymentIntent',
  ].join(',');
  const lines = rows.map((row) => {
    const ms = row.paidAtMs ?? row.createdAtMs ?? Date.now();
    const date = new Date(ms);
    const values = [
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      row.customerName ?? row.customerId,
      row.amount.toFixed(2),
      row.status,
      row.orderId ?? '',
      row.matchId ?? '',
      row.stripePaymentIntentId,
    ];
    return values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  return [header, ...lines].join('\n');
}

export function formatPaymentStatusLabel(status: PaymentTransactionStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    case 'disputed':
      return 'Disputed';
    default:
      return status;
  }
}

export function formatCurrency(amount: number, currency = 'cad'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
