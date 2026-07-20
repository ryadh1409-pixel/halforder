import { db } from '@/services/firebase';
import type {
  FinanceExceptionRow,
  FinanceOrderRow,
} from '@/types/financeDashboard';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type Unsubscribe,
  onSnapshot,
} from 'firebase/firestore';

function readString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function readNumber(...values: unknown[]): number {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

function mapOrderDoc(id: string, data: Record<string, unknown>): FinanceOrderRow {
  const total = readNumber(
    data.totalPrice,
    data.total,
    data.customerTotal,
    data.amount,
  );
  const split = readNumber(
    data.splitPrice,
    data.sharingPrice,
    data.sharePrice,
    data.foodShareCost,
  );
  const platformFee = readNumber(data.platformFee, data.serviceFee);
  const deliveryFee = readNumber(data.deliveryFee);
  return {
    id,
    customer: readString(data.customerName, data.userName, data.userId, data.creatorId),
    restaurant: readString(data.restaurantName, data.restaurantId),
    meal: readString(data.foodName, data.title, data.itemName, 'Order'),
    totalAmount: total,
    splitAmount: split > 0 ? split : total / 2,
    platformFee,
    deliveryFee,
    netRevenue: platformFee,
    status: readString(data.status, 'unknown'),
    paymentStatus: readString(data.paymentStatus, 'unknown'),
    dateMs: safeToMillis(data.createdAt) ?? safeToMillis(data.updatedAt),
  };
}

export type FinanceOrderStats = {
  total: number;
  completed: number;
  active: number;
  cancelled: number;
  failed: number;
  rows: FinanceOrderRow[];
};

function classifyStatus(status: string): 'completed' | 'active' | 'cancelled' | 'failed' | 'other' {
  const s = status.toLowerCase();
  if (
    s.includes('cancel') ||
    s === 'cancelled' ||
    s === 'canceled'
  ) {
    return 'cancelled';
  }
  if (s.includes('fail') || s === 'failed') return 'failed';
  if (
    s.includes('complete') ||
    s === 'delivered' ||
    s === 'completed'
  ) {
    return 'completed';
  }
  if (
    s.includes('pending') ||
    s.includes('active') ||
    s.includes('prepar') ||
    s.includes('assign') ||
    s.includes('pickup') ||
    s.includes('deliver') ||
    s === 'accepted' ||
    s === 'matched'
  ) {
    return 'active';
  }
  return 'other';
}

export function summarizeFinanceOrders(rows: FinanceOrderRow[]): FinanceOrderStats {
  let completed = 0;
  let active = 0;
  let cancelled = 0;
  let failed = 0;
  for (const row of rows) {
    const c = classifyStatus(row.status);
    if (c === 'completed') completed += 1;
    else if (c === 'active') active += 1;
    else if (c === 'cancelled') cancelled += 1;
    else if (c === 'failed') failed += 1;
  }
  return {
    total: rows.length,
    completed,
    active,
    cancelled,
    failed,
    rows,
  };
}

export async function fetchFinanceOrders(max = 400): Promise<FinanceOrderRow[]> {
  const snap = await getDocs(
    query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snap.docs.map((d) =>
    mapOrderDoc(d.id, d.data() as Record<string, unknown>),
  );
}

export function subscribeFinanceOrders(
  onRows: (rows: FinanceOrderRow[]) => void,
  max = 400,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(max)),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapOrderDoc(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

/** Detect payment/order mismatches for the Payment Exceptions panel. */
export function detectFinanceExceptions(
  orders: FinanceOrderRow[],
  paymentByOrderId: Map<
    string,
    {
      status: string;
      amount: number;
      transactionId: string;
      timestampMs: number | null;
    }
  >,
): FinanceExceptionRow[] {
  const out: FinanceExceptionRow[] = [];
  for (const order of orders) {
    const pay = paymentByOrderId.get(order.id);
    const status = order.status.toLowerCase();
    const payStatus = (pay?.status ?? order.paymentStatus).toLowerCase();
    const paid =
      payStatus === 'paid' ||
      payStatus === 'succeeded' ||
      order.paymentStatus.toLowerCase() === 'paid';

    let issue: string | null = null;
    let refundStatus = 'none';
    let resolution = 'Review required';

    if (paid && (status.includes('cancel') || status === 'cancelled')) {
      issue = 'Customer paid but order cancelled';
      refundStatus = 'pending';
      resolution = 'Issue refund or reinstate order';
    } else if (paid && (status.includes('fail') || status === 'failed')) {
      issue = 'Customer paid but delivery/order failed';
      refundStatus = 'pending';
      resolution = 'Confirm refund and notify customer';
    } else if (payStatus === 'disputed') {
      issue = 'Payment dispute';
      refundStatus = 'dispute';
      resolution = 'Respond to Stripe dispute';
    } else if (payStatus === 'refunded') {
      issue = 'Refund completed';
      refundStatus = 'completed';
      resolution = 'Archived';
    } else if (paid && classifyStatus(order.status) === 'active') {
      const age = order.dateMs != null ? Date.now() - order.dateMs : 0;
      if (age > 3 * 60 * 60 * 1000) {
        issue = 'Order stuck (paid, still active)';
        refundStatus = 'monitor';
        resolution = 'Escalate operations';
      }
    }

    if (!issue) continue;
    out.push({
      orderId: order.id,
      customer: order.customer,
      restaurant: order.restaurant,
      meal: order.meal,
      amount: pay?.amount ?? order.totalAmount,
      paymentStatus: pay?.status ?? order.paymentStatus,
      refundStatus,
      issue,
      resolution,
      transactionId: pay?.transactionId ?? '',
      timestampMs: pay?.timestampMs ?? order.dateMs,
      adminNotes: '',
    });
  }
  return out.slice(0, 50);
}
