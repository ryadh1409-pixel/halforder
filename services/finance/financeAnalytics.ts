import {
  buildDailyRevenueBuckets,
  formatCurrency,
  summarizeAdminPayments,
} from '@/services/adminPaymentCenter';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import type {
  FinanceBalanceSheet,
  FinanceCashFlow,
  FinanceCustomerRow,
  FinanceDateFilter,
  FinanceInsight,
  FinanceKpis,
  FinancePaymentAnalytics,
  FinanceProfitLoss,
  FinanceRecommendation,
  FinanceRefundAnalytics,
  FinanceRestaurantRow,
  FinanceRevenueAnalytics,
  FinanceRevenuePoint,
  FinanceTaxSummary,
} from '@/types/financeDashboard';

export { formatCurrency };

export function financePeriodStartMs(
  filter: FinanceDateFilter,
  customStartMs?: number | null,
): number {
  const now = new Date();
  if (filter === 'custom' && customStartMs != null) return customStartMs;
  if (filter === 'all') return 0;
  if (filter === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (filter === 'yesterday') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  if (filter === 'week') {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (filter === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  if (filter === 'last_month') {
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  }
  return 0;
}

export function financePeriodEndMs(
  filter: FinanceDateFilter,
  customEndMs?: number | null,
): number {
  if (filter === 'custom' && customEndMs != null) return customEndMs;
  if (filter === 'yesterday') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (filter === 'last_month') {
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  }
  return Date.now() + 1;
}

export function filterFinancePayments(
  rows: AdminPaymentTransaction[],
  filter: FinanceDateFilter,
  search: string,
  customStartMs?: number | null,
  customEndMs?: number | null,
): AdminPaymentTransaction[] {
  const start = financePeriodStartMs(filter, customStartMs);
  const end = financePeriodEndMs(filter, customEndMs);
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    const ms = row.paidAtMs ?? row.createdAtMs ?? 0;
    if (ms < start || ms >= end) return false;
    if (!q) return true;
    const hay = [
      row.customerName,
      row.customerId,
      row.orderId,
      row.matchId,
      row.stripePaymentIntentId,
      row.stripeChargeId,
      row.adminFoodShareName,
      row.restaurantName,
      row.partnerName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function paidRows(rows: AdminPaymentTransaction[]) {
  return rows.filter((r) => r.status === 'paid');
}

export function buildFinanceKpis(
  payments: AdminPaymentTransaction[],
  orderStats: {
    total: number;
    completed: number;
    active: number;
    cancelled: number;
    failed: number;
  },
): FinanceKpis {
  const paid = paidRows(payments);
  const gmv = paid.reduce((s, r) => s + r.amount, 0);
  const platformRevenue = paid.reduce((s, r) => s + r.platformFee, 0);
  const stripeFees = paid.reduce((s, r) => s + r.stripeFee, 0);
  const refunded = payments.filter((r) => r.status === 'refunded');
  const totalRefundsAmount = refunded.reduce((s, r) => s + r.amount, 0);
  const pendingRefundsCount = payments.filter(
    (r) => r.status === 'disputed' || (r.status === 'refunded' && !r.paidAtMs),
  ).length;
  const successfulPayments = payments.filter((r) => r.status === 'paid').length;
  const failedPayments = payments.filter((r) => r.status === 'failed').length;
  const averageOrderValue = paid.length ? gmv / paid.length : 0;
  const splits = paid.map((r) =>
    r.source === 'food_share' ? r.amount : r.foodAmount || r.amount,
  );
  const averageSplitValue = splits.length
    ? splits.reduce((a, b) => a + b, 0) / splits.length
    : 0;
  const netRevenue = platformRevenue - stripeFees - totalRefundsAmount * 0; // refunds tracked separately in P&L

  return {
    gmv,
    platformRevenue,
    netRevenue: Math.max(0, platformRevenue - stripeFees),
    totalOrders: orderStats.total,
    completedOrders: orderStats.completed,
    activeOrders: orderStats.active,
    cancelledOrders: orderStats.cancelled,
    failedOrders: orderStats.failed,
    totalRefundsAmount,
    pendingRefundsCount,
    successfulPayments,
    failedPayments,
    averageOrderValue,
    averageSplitValue,
  };
}

function bucketByPeriod(
  rows: AdminPaymentTransaction[],
  mode: 'week' | 'month' | 'year',
  count: number,
): FinanceRevenuePoint[] {
  const out: FinanceRevenuePoint[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    let start: Date;
    let end: Date;
    let label: string;
    if (mode === 'week') {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i * 7 - start.getDay() + 1);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      label = `W${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else if (mode === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      label = start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } else {
      start = new Date(now.getFullYear() - i, 0, 1);
      end = new Date(now.getFullYear() - i + 1, 0, 1);
      label = String(start.getFullYear());
    }
    let revenue = 0;
    let c = 0;
    for (const row of rows) {
      if (row.status !== 'paid') continue;
      const ms = row.paidAtMs ?? row.createdAtMs ?? 0;
      if (ms >= start.getTime() && ms < end.getTime()) {
        revenue += row.amount;
        c += 1;
      }
    }
    out.push({ label, revenue, count: c });
  }
  return out;
}

export function buildRevenueAnalytics(
  rows: AdminPaymentTransaction[],
): FinanceRevenueAnalytics {
  const daily = buildDailyRevenueBuckets(rows, 14).map((b) => ({
    label: b.label,
    revenue: b.revenue,
    count: b.count,
  }));
  const weekly = bucketByPeriod(rows, 'week', 8);
  const monthly = bucketByPeriod(rows, 'month', 12);
  const yearly = bucketByPeriod(rows, 'year', 4);

  const thisMonth = monthly[monthly.length - 1]?.revenue ?? 0;
  const prevMonth = monthly[monthly.length - 2]?.revenue ?? 0;
  const growthPct =
    prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : thisMonth > 0 ? 100 : 0;
  const trendLabel =
    growthPct > 5 ? 'Upward' : growthPct < -5 ? 'Downward' : 'Stable';

  return { daily, weekly, monthly, yearly, growthPct, trendLabel };
}

export function buildPaymentAnalytics(
  rows: AdminPaymentTransaction[],
): FinancePaymentAnalytics {
  const successful = rows.filter((r) => r.status === 'paid').length;
  const failed = rows.filter((r) => r.status === 'failed').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const refunded = rows.filter((r) => r.status === 'refunded').length;
  const paid = paidRows(rows);
  const stripeFees = paid.reduce((s, r) => s + r.stripeFee, 0);
  const gross = paid.reduce((s, r) => s + r.amount, 0);
  const settled = successful + failed;
  return {
    successful,
    failed,
    pending,
    refunded,
    stripeFees,
    netReceived: gross - stripeFees,
    averagePayment: successful ? gross / successful : 0,
    successRate: settled ? (successful / settled) * 100 : 0,
  };
}

export function buildRefundAnalytics(
  rows: AdminPaymentTransaction[],
): FinanceRefundAnalytics {
  const refunded = rows.filter((r) => r.status === 'refunded' || r.status === 'disputed');
  const paidCount = rows.filter((r) => r.status === 'paid' || r.status === 'refunded').length;
  const totalRefundAmount = refunded.reduce((s, r) => s + r.amount, 0);
  const completedCount = rows.filter((r) => r.status === 'refunded').length;
  const pendingCount = rows.filter((r) => r.status === 'disputed').length;
  const timeline = buildDailyRevenueBuckets(
    refunded.map((r) => ({ ...r, status: 'paid' as const })),
    14,
  ).map((b) => ({ label: b.label, revenue: b.revenue, count: b.count }));

  return {
    totalRefundAmount,
    pendingCount,
    completedCount,
    refundRate: paidCount ? (completedCount / paidCount) * 100 : 0,
    reasons: [
      { reason: 'Refunded payment', count: completedCount },
      { reason: 'Dispute / chargeback', count: pendingCount },
    ].filter((r) => r.count > 0),
    timeline,
    history: refunded.slice(0, 40).map((r) => ({
      id: r.id,
      amount: r.amount,
      status: r.status,
      customer: r.customerName ?? r.customerId,
      dateMs: r.paidAtMs ?? r.createdAtMs,
      reason: r.status === 'disputed' ? 'Payment dispute' : 'Refund completed',
    })),
  };
}

export function buildRestaurantFinancials(
  rows: AdminPaymentTransaction[],
): FinanceRestaurantRow[] {
  const map = new Map<
    string,
    {
      name: string;
      revenue: number;
      orders: number;
      refunds: number;
      meals: Map<string, number>;
    }
  >();
  for (const row of rows) {
    const key = row.restaurantId || row.partnerId || 'unknown';
    const name = row.restaurantName || row.partnerName || key;
    let cur = map.get(key);
    if (!cur) {
      cur = { name, revenue: 0, orders: 0, refunds: 0, meals: new Map() };
      map.set(key, cur);
    }
    if (row.status === 'paid') {
      cur.revenue += row.amount;
      cur.orders += 1;
      const meal = row.adminFoodShareName || 'Order';
      cur.meals.set(meal, (cur.meals.get(meal) ?? 0) + 1);
    }
    if (row.status === 'refunded') cur.refunds += 1;
  }
  return Array.from(map.entries())
    .map(([restaurantId, v]) => {
      const topMeals = Array.from(v.meals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([m]) => m);
      return {
        restaurantId,
        name: v.name,
        revenue: v.revenue,
        orders: v.orders,
        aov: v.orders ? v.revenue / v.orders : 0,
        avgSplit: v.orders ? v.revenue / v.orders : 0,
        refundRate: v.orders + v.refunds ? (v.refunds / (v.orders + v.refunds)) * 100 : 0,
        cancellationRate: 0,
        topMeals,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 25);
}

export function buildCustomerSpending(
  rows: AdminPaymentTransaction[],
): FinanceCustomerRow[] {
  const map = new Map<
    string,
    { name: string; spend: number; orders: number; refunds: number }
  >();
  for (const row of rows) {
    const key = row.customerId || 'unknown';
    let cur = map.get(key);
    if (!cur) {
      cur = { name: row.customerName || key, spend: 0, orders: 0, refunds: 0 };
      map.set(key, cur);
    }
    if (row.status === 'paid') {
      cur.spend += row.amount;
      cur.orders += 1;
    }
    if (row.status === 'refunded') cur.refunds += 1;
  }
  return Array.from(map.entries())
    .map(([customerId, v]) => ({
      customerId,
      name: v.name,
      lifetimeSpend: v.spend,
      totalOrders: v.orders,
      aov: v.orders ? v.spend / v.orders : 0,
      avgSplit: v.orders ? v.spend / v.orders : 0,
      refundCount: v.refunds,
    }))
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
    .slice(0, 25);
}

export function buildProfitLoss(
  payments: AdminPaymentTransaction[],
  operatingExpenses: number,
): FinanceProfitLoss {
  const summary = summarizeAdminPayments(payments);
  const paid = paidRows(payments);
  const stripeFees = paid.reduce((s, r) => s + r.stripeFee, 0);
  const refunds = payments
    .filter((r) => r.status === 'refunded')
    .reduce((s, r) => s + r.amount, 0);
  const grossRevenue = summary.grossRevenue;
  const platformRevenue = summary.platformFees;
  const netRevenue = platformRevenue - stripeFees;
  const netProfit = netRevenue - operatingExpenses - refunds * 0.1;
  const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
  return {
    grossRevenue,
    platformRevenue,
    operatingExpenses,
    refunds,
    netRevenue,
    netProfit,
    profitMargin,
  };
}

export function buildCashFlow(
  payments: AdminPaymentTransaction[],
  operatingExpenses: number,
  treasuryAvailable?: number | null,
  treasuryPending?: number | null,
): FinanceCashFlow {
  const paid = paidRows(payments);
  const moneyIn = paid.reduce((s, r) => s + r.amount, 0);
  const stripeFees = paid.reduce((s, r) => s + r.stripeFee, 0);
  const refunds = payments
    .filter((r) => r.status === 'refunded')
    .reduce((s, r) => s + r.amount, 0);
  const moneyOut = stripeFees + operatingExpenses + refunds;
  const pending = payments
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + r.amount, 0);
  return {
    moneyIn,
    moneyOut,
    currentBalance: treasuryAvailable ?? moneyIn - moneyOut,
    pendingBalance: treasuryPending ?? pending,
    expectedIncoming: pending,
    expectedOutgoing: operatingExpenses * 0.25,
  };
}

export function buildBalanceSheet(
  cashFlow: FinanceCashFlow,
  pl: FinanceProfitLoss,
): FinanceBalanceSheet {
  const cash = cashFlow.currentBalance;
  const accountsReceivable = cashFlow.pendingBalance;
  const assets = cash + accountsReceivable;
  const accountsPayable = cashFlow.expectedOutgoing;
  const liabilities = accountsPayable;
  const equity = pl.netProfit;
  return {
    assets,
    cash,
    accountsReceivable,
    liabilities,
    accountsPayable,
    equity,
    netAssets: assets - liabilities,
  };
}

export function buildTaxSummary(
  payments: AdminPaymentTransaction[],
  taxRate = 0.13,
): FinanceTaxSummary {
  const paid = paidRows(payments);
  let food = 0;
  for (const r of paid) {
    food += r.foodAmount > 0 ? r.foodAmount : r.amount;
  }
  const collectedTaxes = food * taxRate;
  return {
    collectedTaxes,
    estimatedTaxes: collectedTaxes,
    taxableRevenue: food,
  };
}

export function buildEmoFinanceInsights(
  kpis: FinanceKpis,
  revenue: FinanceRevenueAnalytics,
  restaurants: FinanceRestaurantRow[],
  payments: FinancePaymentAnalytics,
): FinanceInsight[] {
  const insights: FinanceInsight[] = [];
  insights.push({
    id: 'growth',
    text: `Revenue growth is ${revenue.growthPct >= 0 ? '+' : ''}${revenue.growthPct.toFixed(1)}% vs prior month (${revenue.trendLabel.toLowerCase()} trend).`,
  });
  insights.push({
    id: 'gmv',
    text: `Gross Merchandise Value stands at ${formatCurrency(kpis.gmv)} with platform revenue of ${formatCurrency(kpis.platformRevenue)}.`,
  });
  if (restaurants[0]) {
    insights.push({
      id: 'top_rest',
      text: `${restaurants[0].name} leads restaurant revenue at ${formatCurrency(restaurants[0].revenue)}.`,
    });
    if (restaurants[0].topMeals[0]) {
      insights.push({
        id: 'top_meal',
        text: `${restaurants[0].topMeals[0]} is among the top-selling meals for the leading restaurant.`,
      });
    }
  }
  insights.push({
    id: 'pay_success',
    text: `Payment success rate is ${payments.successRate.toFixed(1)}% (${payments.successful} successful, ${payments.failed} failed).`,
  });
  insights.push({
    id: 'aov',
    text: `Average order value is ${formatCurrency(kpis.averageOrderValue)}; average split value is ${formatCurrency(kpis.averageSplitValue)}.`,
  });
  if (kpis.totalRefundsAmount > 0) {
    insights.push({
      id: 'refunds',
      text: `Refund volume totals ${formatCurrency(kpis.totalRefundsAmount)} — monitor refund rate closely.`,
    });
  }
  return insights;
}

export function buildEmoFinanceRecommendations(
  kpis: FinanceKpis,
  refunds: FinanceRefundAnalytics,
  restaurants: FinanceRestaurantRow[],
  payments: FinancePaymentAnalytics,
): FinanceRecommendation[] {
  const recs: FinanceRecommendation[] = [];
  if (refunds.refundRate > 5) {
    recs.push({
      id: 'refunds',
      text: 'Investigate restaurants with elevated refund rates and tighten cancellation policies.',
    });
  }
  if (payments.failed > 0) {
    recs.push({
      id: 'pay_fail',
      text: 'Monitor payment failures and retry flows to protect conversion at checkout.',
    });
  }
  if (kpis.activeOrders > 0) {
    recs.push({
      id: 'active',
      text: 'Reduce delivery failures by prioritizing active orders nearing SLA risk.',
    });
  }
  const highRefundRest = restaurants.filter((r) => r.refundRate > 8).slice(0, 3);
  if (highRefundRest.length) {
    recs.push({
      id: 'rest_refund',
      text: `Review high-refund partners: ${highRefundRest.map((r) => r.name).join(', ')}.`,
    });
  }
  recs.push({
    id: 'promo',
    text: 'Increase lunch promotions on top-performing meals to lift midday GMV.',
  });
  recs.push({
    id: 'optimize',
    text: 'Optimize delivery fee mix where average split value trails marketplace AOV.',
  });
  return recs;
}
