import { isOrderCompleted } from '@/lib/orderCompletion';

/** Default driver share of delivery fee (%) when Admin config is missing. */
export const DEFAULT_DRIVER_PAYOUT_PERCENT = 80;

/**
 * @deprecated Use DEFAULT_DRIVER_PAYOUT_PERCENT (0–100) or getCachedDriverPayoutPercent().
 * Kept as a fraction for older imports/tests.
 */
export const DRIVER_EARNING_PERCENT = DEFAULT_DRIVER_PAYOUT_PERCENT / 100;

const DEFAULT_DELIVERY_FEE = 0.99;

export type OrderPayoutBreakdown = {
  customerTotal: number;
  deliveryFee: number;
  driverPayout: number;
  platformFee: number;
};

export function clampDriverPayoutPercent(
  raw: unknown,
  fallback = DEFAULT_DRIVER_PAYOUT_PERCENT,
): number {
  let n: number | null = null;
  if (typeof raw === 'number' && Number.isFinite(raw)) n = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed)) n = parsed;
  }
  if (n == null) return fallback;
  // Accept legacy fraction storage (0–1 exclusive of 0 display edge).
  if (n > 0 && n <= 1) n = n * 100;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

export function resolveOrderDeliveryFee(data: {
  deliveryFee?: unknown;
  fees?: unknown;
}): number {
  if (
    typeof data.deliveryFee === 'number' &&
    Number.isFinite(data.deliveryFee) &&
    data.deliveryFee > 0
  ) {
    return data.deliveryFee;
  }
  if (typeof data.fees === 'number' && Number.isFinite(data.fees) && data.fees > 0) {
    return data.fees;
  }
  return DEFAULT_DELIVERY_FEE;
}

/**
 * Driver payout = Delivery Fee × (percent / 100)
 * Platform earnings = Delivery Fee − Driver payout
 */
export function calculateOrderPayout(
  data: {
    totalPrice?: unknown;
    deliveryFee?: unknown;
    fees?: unknown;
  },
  driverPayoutPercent: number = DEFAULT_DRIVER_PAYOUT_PERCENT,
): OrderPayoutBreakdown {
  const customerTotal =
    typeof data.totalPrice === 'number' && Number.isFinite(data.totalPrice)
      ? data.totalPrice
      : 0;
  const deliveryFee = resolveOrderDeliveryFee(data);
  const percent = clampDriverPayoutPercent(
    driverPayoutPercent,
    DEFAULT_DRIVER_PAYOUT_PERCENT,
  );
  const share = percent / 100;
  const driverPayout = Math.round(deliveryFee * share * 100) / 100;
  const platformFee = Math.round((deliveryFee - driverPayout) * 100) / 100;
  return { customerTotal, deliveryFee, driverPayout, platformFee };
}

/** @deprecated Use calculateOrderPayout().driverPayout */
export function calculateDriverEarningForOrder(
  data: {
    deliveryFee?: unknown;
    fees?: unknown;
    driverPayout?: unknown;
    earningsRecorded?: unknown;
  },
  driverPayoutPercent: number = DEFAULT_DRIVER_PAYOUT_PERCENT,
): number {
  // Prefer live config × delivery fee when fee is known (admin % applies immediately).
  if (
    (typeof data.deliveryFee === 'number' && data.deliveryFee > 0) ||
    (typeof data.fees === 'number' && data.fees > 0)
  ) {
    return calculateOrderPayout(data, driverPayoutPercent).driverPayout;
  }
  if (
    data.earningsRecorded === true &&
    typeof data.driverPayout === 'number' &&
    Number.isFinite(data.driverPayout)
  ) {
    return data.driverPayout;
  }
  return calculateOrderPayout(data, driverPayoutPercent).driverPayout;
}

export function isSameLocalDay(
  ms: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return false;
  const d = new Date(ms);
  const n = new Date(nowMs);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/** ISO week bucket — Monday start. */
export function isSameLocalWeek(
  ms: number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return false;
  const weekStart = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  return weekStart(new Date(ms)) === weekStart(new Date(nowMs));
}

export const DRIVER_COMPLETED_STATUSES = ['delivered', 'completed'] as const;

export type DriverEarningsBreakdownItem = {
  orderId: string;
  earning: number;
  platformFee: number;
  deliveredAtMs: number | null;
};

function resolveCompletionMs(data: Record<string, unknown>): number | null {
  if (typeof data.completedAtMs === 'number' && data.completedAtMs > 0) return data.completedAtMs;
  if (typeof data.deliveredAtMs === 'number' && data.deliveredAtMs > 0) return data.deliveredAtMs;
  if (typeof data.updatedAtMs === 'number' && data.updatedAtMs > 0) return data.updatedAtMs;
  return null;
}

export type DriverEarningsStats = {
  deliveries: number;
  earnings: number;
  earningsToday: number;
  earningsWeek: number;
  deliveriesToday: number;
  deliveriesWeek: number;
  averageEarning: number;
  platformFees: number;
  breakdown: DriverEarningsBreakdownItem[];
};

export function isDriverCompletedEarningsOrder(data: Record<string, unknown>): boolean {
  return isOrderCompleted(data);
}

export function resolveDriverPayoutFromOrder(
  data: Record<string, unknown>,
  driverPayoutPercent: number = DEFAULT_DRIVER_PAYOUT_PERCENT,
): number {
  return calculateDriverEarningForOrder(data, driverPayoutPercent);
}

export function buildDriverEarningsStats(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
  nowMs: number = Date.now(),
  driverPayoutPercent: number = DEFAULT_DRIVER_PAYOUT_PERCENT,
): DriverEarningsStats {
  const breakdown: DriverEarningsBreakdownItem[] = [];
  let earnings = 0;
  let earningsToday = 0;
  let earningsWeek = 0;
  let deliveriesToday = 0;
  let deliveriesWeek = 0;
  let platformFees = 0;
  const percent = clampDriverPayoutPercent(
    driverPayoutPercent,
    DEFAULT_DRIVER_PAYOUT_PERCENT,
  );

  for (const docSnap of docs) {
    const data = docSnap.data();
    if (!isDriverCompletedEarningsOrder(data)) continue;

    const payout = calculateOrderPayout(data, percent);
    const hasFee =
      (typeof data.deliveryFee === 'number' && data.deliveryFee > 0) ||
      (typeof data.fees === 'number' && data.fees > 0);
    const earning = hasFee
      ? payout.driverPayout
      : resolveDriverPayoutFromOrder(data, percent);
    const fee = hasFee
      ? payout.platformFee
      : typeof data.platformFee === 'number' && Number.isFinite(data.platformFee)
        ? data.platformFee
        : 0;
    const deliveredAtMs = resolveCompletionMs(data);
    earnings += earning;
    platformFees += fee;
    if (isSameLocalDay(deliveredAtMs, nowMs)) {
      earningsToday += earning;
      deliveriesToday += 1;
    }
    if (isSameLocalWeek(deliveredAtMs, nowMs)) {
      earningsWeek += earning;
      deliveriesWeek += 1;
    }
    breakdown.push({ orderId: docSnap.id, earning, platformFee: fee, deliveredAtMs });
  }

  breakdown.sort((a, b) => (b.deliveredAtMs ?? 0) - (a.deliveredAtMs ?? 0));
  const deliveries = breakdown.length;

  return {
    deliveries,
    earnings: Math.round(earnings * 100) / 100,
    earningsToday: Math.round(earningsToday * 100) / 100,
    earningsWeek: Math.round(earningsWeek * 100) / 100,
    deliveriesToday,
    deliveriesWeek,
    averageEarning:
      deliveries > 0 ? Math.round((earnings / deliveries) * 100) / 100 : 0,
    platformFees: Math.round(platformFees * 100) / 100,
    breakdown,
  };
}
