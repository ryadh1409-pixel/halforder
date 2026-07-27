import { safeToMillis } from '@/utils/safeToMillis';
import type { DocumentData } from 'firebase/firestore';

export type SavingsOrderRow = {
  id: string;
  restaurantName: string;
  dateMs: number;
  originalPrice: number;
  paid: number;
  saved: number;
  isShared: boolean;
  matchId: string | null;
};

export type MonthlySavingsSummary = {
  monthKey: string;
  label: string;
  sharedOrders: number;
  originalFoodValue: number;
  youPaid: number;
  moneySaved: number;
  savingsThisMonth: number;
};

export type MoneySavedBreakdown = {
  savedFromSharedFood: number;
  savedFromPromotions: number;
  savedFromFreeDelivery: number;
  savedFromFreeServiceFee: number;
  savedFromSharedDelivery: number;
  savedFromSharedServiceFee: number;
};

export type MoneySavedLifetimeStats = {
  lifetimeSharedOrders: number;
  lifetimeCompletedOrders: number;
  totalMealsShared: number;
  averageSavedPerOrder: number;
  highestSavingInOneOrder: number;
  totalLifetimeSavings: number;
};

export type MoneySavedAggregated = MoneySavedBreakdown & {
  lifetime: MoneySavedLifetimeStats;
  currentMonth: MonthlySavingsSummary;
  orderHistory: SavingsOrderRow[];
  loading: boolean;
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundMoney(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function rowTimestamp(data: DocumentData): number {
  return (
    safeToMillis(data.paidAt) ??
    safeToMillis(data.completedAtMs) ??
    safeToMillis(data.completedAt) ??
    safeToMillis(data.deliveredAt) ??
    safeToMillis(data.createdAt) ??
    safeToMillis(data.createdAtMs) ??
    0
  );
}

function breakdownFromDoc(data: DocumentData): MoneySavedBreakdown {
  const freeDelivery = data.freeDelivery === true;
  const freeServiceFee = data.freeServiceFee === true;
  const deliverySaving = num(data.deliverySaving);
  const serviceFeeSaving = num(data.serviceFeeSaving);
  const originalDeliveryFee = num(data.originalDeliveryFee);
  const originalServiceFee = num(data.originalServiceFee);

  return {
    savedFromSharedFood: num(data.foodSaving),
    savedFromPromotions: num(data.promotionSaving),
    savedFromFreeDelivery: freeDelivery ? originalDeliveryFee : 0,
    savedFromFreeServiceFee: freeServiceFee ? originalServiceFee : 0,
    savedFromSharedDelivery: freeDelivery ? 0 : deliverySaving,
    savedFromSharedServiceFee: freeServiceFee ? 0 : serviceFeeSaving,
  };
}

function totalSavedFromBreakdown(
  breakdown: MoneySavedBreakdown,
  explicitTotal: number,
): number {
  if (explicitTotal > 0) return explicitTotal;
  return roundMoney(
    breakdown.savedFromSharedFood +
      breakdown.savedFromPromotions +
      breakdown.savedFromFreeDelivery +
      breakdown.savedFromFreeServiceFee +
      breakdown.savedFromSharedDelivery +
      breakdown.savedFromSharedServiceFee,
  );
}

export function savingsRowFromPayment(
  id: string,
  data: DocumentData,
): SavingsOrderRow | null {
  if (String(data.paymentStatus ?? '').toUpperCase() !== 'PAID') return null;

  const breakdown = breakdownFromDoc(data);
  const saved = totalSavedFromBreakdown(breakdown, num(data.totalSaving));
  if (saved <= 0 && breakdown.savedFromSharedFood <= 0) return null;

  const paid =
    typeof data.amount === 'number'
      ? data.amount / 100
      : num(data.totalPrice) || num(data.paidAmount);
  const foodCents = num(data.foodShareCostCents);
  const originalFood =
    foodCents > 0
      ? foodCents / 100 + breakdown.savedFromSharedFood
      : paid + saved;
  const restaurantName =
    (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
    (typeof data.foodName === 'string' && data.foodName.trim()) ||
    'Shared meal';

  return {
    id: `pay_${id}`,
    restaurantName,
    dateMs: rowTimestamp(data),
    originalPrice: roundMoney(originalFood),
    paid: roundMoney(paid),
    saved: roundMoney(saved),
    isShared: data.type === 'food_share',
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
  };
}

export function savingsRowFromOrder(
  id: string,
  data: DocumentData,
): SavingsOrderRow | null {
  const breakdown = breakdownFromDoc(data);
  const saved = totalSavedFromBreakdown(breakdown, num(data.totalSaving));
  if (saved <= 0 && breakdown.savedFromSharedFood <= 0) return null;

  const paid =
    num(data.totalPrice) ||
    num(data.total) ||
    num(data.customerTotal) ||
    num(data.subtotal);
  const subtotal = num(data.subtotal);
  const originalFood =
    subtotal > 0
      ? subtotal + breakdown.savedFromSharedFood
      : paid + saved;
  const restaurantName =
    (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
    (data.restaurant &&
    typeof data.restaurant === 'object' &&
    typeof (data.restaurant as Record<string, unknown>).name === 'string'
      ? String((data.restaurant as Record<string, unknown>).name).trim()
      : '') ||
    (typeof data.foodName === 'string' && data.foodName.trim()) ||
    'Restaurant';

  const isShared =
    data.orderSource === 'food_share' ||
    data.type === 'food_share' ||
    typeof data.matchId === 'string';

  return {
    id: `ord_${id}`,
    restaurantName,
    dateMs: rowTimestamp(data),
    originalPrice: roundMoney(originalFood),
    paid: roundMoney(paid),
    saved: roundMoney(saved),
    isShared,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
  };
}

function mergeRows(
  paymentRows: SavingsOrderRow[],
  orderRows: SavingsOrderRow[],
): SavingsOrderRow[] {
  const byMatch = new Map<string, SavingsOrderRow>();
  const standalone: SavingsOrderRow[] = [];

  for (const row of paymentRows) {
    if (row.matchId) byMatch.set(row.matchId, row);
    else standalone.push(row);
  }

  for (const row of orderRows) {
    if (row.matchId && byMatch.has(row.matchId)) continue;
    if (row.matchId) byMatch.set(row.matchId, row);
    else standalone.push(row);
  }

  return [...byMatch.values(), ...standalone].sort((a, b) => b.dateMs - a.dateMs);
}

function dedupeDocsForBreakdown(
  payments: Array<{ id: string; data: DocumentData }>,
  orders: Array<{ id: string; data: DocumentData }>,
): DocumentData[] {
  const paymentByMatch = new Map<string, DocumentData>();
  const orderByMatch = new Map<string, DocumentData>();
  const standalone: DocumentData[] = [];

  for (const payment of payments) {
    const matchId =
      typeof payment.data.matchId === 'string' ? payment.data.matchId : null;
    if (matchId) paymentByMatch.set(matchId, payment.data);
    else standalone.push(payment.data);
  }

  for (const order of orders) {
    const matchId = typeof order.data.matchId === 'string' ? order.data.matchId : null;
    if (matchId) {
      if (!paymentByMatch.has(matchId)) orderByMatch.set(matchId, order.data);
    } else {
      standalone.push(order.data);
    }
  }

  return [...paymentByMatch.values(), ...orderByMatch.values(), ...standalone];
}

export function aggregateMoneySaved(input: {
  payments: Array<{ id: string; data: DocumentData }>;
  orders: Array<{ id: string; data: DocumentData }>;
  loading: boolean;
}): MoneySavedAggregated {
  const paymentRows = input.payments
    .map((p) => savingsRowFromPayment(p.id, p.data))
    .filter((r): r is SavingsOrderRow => r != null);
  const orderRows = input.orders
    .map((o) => savingsRowFromOrder(o.id, o.data))
    .filter((r): r is SavingsOrderRow => r != null);
  const orderHistory = mergeRows(paymentRows, orderRows);

  let savedFromSharedFood = 0;
  let savedFromPromotions = 0;
  let savedFromFreeDelivery = 0;
  let savedFromFreeServiceFee = 0;
  let savedFromSharedDelivery = 0;
  let savedFromSharedServiceFee = 0;

  const addBreakdown = (data: DocumentData) => {
    const b = breakdownFromDoc(data);
    savedFromSharedFood += b.savedFromSharedFood;
    savedFromPromotions += b.savedFromPromotions;
    savedFromFreeDelivery += b.savedFromFreeDelivery;
    savedFromFreeServiceFee += b.savedFromFreeServiceFee;
    savedFromSharedDelivery += b.savedFromSharedDelivery;
    savedFromSharedServiceFee += b.savedFromSharedServiceFee;
  };

  for (const doc of dedupeDocsForBreakdown(input.payments, input.orders)) {
    addBreakdown(doc);
  }

  const seenMatchIds = new Set<string>();
  let lifetimeSharedOrders = 0;
  for (const row of orderHistory) {
    if (!row.isShared) continue;
    const key = row.matchId ?? row.id;
    if (seenMatchIds.has(key)) continue;
    seenMatchIds.add(key);
    lifetimeSharedOrders += 1;
  }

  const totalLifetimeSavings = roundMoney(
    savedFromSharedFood +
      savedFromPromotions +
      savedFromFreeDelivery +
      savedFromFreeServiceFee +
      savedFromSharedDelivery +
      savedFromSharedServiceFee,
  );

  const highestSavingInOneOrder = orderHistory.reduce(
    (max, row) => Math.max(max, row.saved),
    0,
  );
  const lifetimeCompletedOrders = orderHistory.length;
  const averageSavedPerOrder =
    lifetimeCompletedOrders > 0
      ? roundMoney(totalLifetimeSavings / lifetimeCompletedOrders)
      : 0;

  const now = new Date();
  const currentKey = monthKey(now);
  const monthRows = orderHistory.filter((row) => {
    if (!row.dateMs) return false;
    return monthKey(new Date(row.dateMs)) === currentKey;
  });
  const monthShared = monthRows.filter((r) => r.isShared).length;
  const monthOriginal = roundMoney(
    monthRows.reduce((sum, r) => sum + r.originalPrice, 0),
  );
  const monthPaid = roundMoney(monthRows.reduce((sum, r) => sum + r.paid, 0));
  const monthSaved = roundMoney(monthRows.reduce((sum, r) => sum + r.saved, 0));

  return {
    savedFromSharedFood: roundMoney(savedFromSharedFood),
    savedFromPromotions: roundMoney(savedFromPromotions),
    savedFromFreeDelivery: roundMoney(savedFromFreeDelivery),
    savedFromFreeServiceFee: roundMoney(savedFromFreeServiceFee),
    savedFromSharedDelivery: roundMoney(savedFromSharedDelivery),
    savedFromSharedServiceFee: roundMoney(savedFromSharedServiceFee),
    lifetime: {
      lifetimeSharedOrders,
      lifetimeCompletedOrders,
      totalMealsShared: lifetimeSharedOrders,
      averageSavedPerOrder,
      highestSavingInOneOrder: roundMoney(highestSavingInOneOrder),
      totalLifetimeSavings,
    },
    currentMonth: {
      monthKey: currentKey,
      label: monthLabel(now),
      sharedOrders: monthShared,
      originalFoodValue: monthOriginal,
      youPaid: monthPaid,
      moneySaved: monthSaved,
      savingsThisMonth: monthSaved,
    },
    orderHistory,
    loading: input.loading,
  };
}
