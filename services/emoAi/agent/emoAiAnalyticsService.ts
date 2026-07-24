import { collection, getDocs, limit, query } from 'firebase/firestore';

import { db } from '@/services/firebase';
import {
  fetchAdminPaymentTransactions,
  summarizeAdminPayments,
} from '@/services/adminPaymentCenter';
import { listEmoAiConversations } from '@/services/emoAi/emoAiConversations';
import {
  buildEmoConversationAnalytics,
  buildEmoConversationInsights,
} from '@/services/emoAi/emoAiConversationInsights';
import { safeToMillis } from '@/utils/safeToMillis';
import type {
  EmoAiCustomerIssueBucket,
  EmoAiExecutiveReport,
  EmoAiPaymentException,
  EmoAiReportPeriod,
} from '@/types/emoAiAgent';

import { summarizeConversationThemes } from './emoAiConversationSummarizer';
import { buildEmoAiInsightsAndRecommendations } from './emoAiInsightsEngine';

function readStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function readNum(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

function periodWindow(
  period: EmoAiReportPeriod,
  now = Date.now(),
): { start: number; end: number; title: string } {
  const end = now;
  const d = new Date(now);
  if (period === 'daily') {
    d.setHours(0, 0, 0, 0);
    return {
      start: d.getTime(),
      end,
      title: `HalfOrder Daily Executive Report — ${d.toLocaleDateString()}`,
    };
  }
  if (period === 'weekly') {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return {
      start: d.getTime(),
      end,
      title: `HalfOrder Weekly Executive Report — week of ${d.toLocaleDateString()}`,
    };
  }
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return {
    start: d.getTime(),
    end,
    title: `HalfOrder Monthly Executive Report — ${d.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`,
  };
}

function classifyIssue(order: Record<string, unknown>): string | null {
  const status = readStr(order.status, order.orderStatus).toLowerCase();
  const pay = readStr(order.paymentStatus).toLowerCase();
  const del = readStr(order.deliveryStatus).toLowerCase();
  const issue = readStr(order.issueType, order.customerIssue, order.reportReason).toLowerCase();
  if (issue.includes('wrong')) return 'Wrong order';
  if (issue.includes('missing')) return 'Missing items';
  if (issue.includes('never') || issue.includes('not arrive')) return 'Food never arrived';
  if (issue.includes('late') || del.includes('delay')) return 'Late delivery';
  if (issue.includes('refund') || pay.includes('refund')) return 'Refund problem';
  if (issue.includes('payment') || pay === 'failed') return 'Payment problem';
  if (status.includes('restaurant') && status.includes('cancel')) return 'Restaurant cancelled';
  if (status.includes('driver') && status.includes('cancel')) return 'Driver cancelled';
  if (issue.includes('poor') || issue.includes('service')) return 'Poor service';
  if (pay === 'paid' && (status.includes('cancel') || status.includes('fail'))) {
    return 'Customer paid but order failed/cancelled';
  }
  return null;
}

function isPaymentException(order: Record<string, unknown>): boolean {
  const pay = readStr(order.paymentStatus).toLowerCase();
  const status = readStr(order.status, order.orderStatus).toLowerCase();
  const refund = readStr(order.refundStatus).toLowerCase();
  const paid =
    pay === 'paid' || pay === 'succeeded' || pay === 'completed' || Boolean(order.paidAt);
  if (!paid) return false;
  return (
    status.includes('cancel') ||
    status.includes('fail') ||
    status.includes('stuck') ||
    refund.includes('request') ||
    refund.includes('pending') ||
    refund.includes('complete') ||
    Boolean(order.customerReportedIssue) ||
    Boolean(order.deliveryFailed)
  );
}

/** Aggregate platform metrics into an executive report document (client or admin). */
export async function buildEmoAiAnalyticsReport(
  period: EmoAiReportPeriod,
): Promise<Omit<EmoAiExecutiveReport, 'id' | 'pdfStoragePath' | 'pdfDownloadUrl' | 'archived' | 'status'>> {
  const { start, end, title } = periodWindow(period);
  const [usersSnap, ordersSnap, paymentTx] = await Promise.all([
    getDocs(query(collection(db, 'users'), limit(5000))),
    getDocs(query(collection(db, 'orders'), limit(5000))),
    fetchAdminPaymentTransactions().catch(() => []),
  ]);

  type Row = Record<string, unknown> & { id: string };
  const users: Row[] = usersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
  const orders: Row[] = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));

  const inWindow = (ms: number | null | undefined) => typeof ms === "number" && ms >= start && ms <= end;

  const newUsers = users.filter((u) => inWindow(safeToMillis(u.createdAt))).length;
  const activeUserIds = new Set<string>();
  for (const o of orders) {
    const ms = safeToMillis(o.createdAt);
    if (!inWindow(ms)) continue;
    const uid = readStr(o.userId, o.customerId);
    if (uid) activeUserIds.add(uid);
  }

  const windowOrders = orders.filter((o) => inWindow(safeToMillis(o.createdAt)));
  const completedOrders = windowOrders.filter((o) => {
    const s = readStr(o.status, o.deliveryStatus).toLowerCase();
    return s.includes('deliver') || s.includes('complete');
  });
  const cancelledOrders = windowOrders.filter((o) =>
    readStr(o.status).toLowerCase().includes('cancel'),
  );
  const failedOrders = windowOrders.filter((o) => {
    const s = readStr(o.status, o.paymentStatus).toLowerCase();
    return s.includes('fail');
  });
  const pendingOrders = windowOrders.filter((o) => {
    const s = readStr(o.status).toLowerCase();
    return s.includes('pending') || s.includes('waiting') || s.includes('open');
  });
  const activeOrders = windowOrders.filter((o) => {
    const s = readStr(o.status, o.deliveryStatus).toLowerCase();
    return (
      !s.includes('deliver') &&
      !s.includes('complete') &&
      !s.includes('cancel') &&
      !s.includes('fail')
    );
  });

  const revenueOrders = completedOrders;
  const revenue = revenueOrders.reduce((sum, o) => sum + readNum(o.total, o.amount, o.grandTotal), 0);
  const aov = revenueOrders.length ? revenue / revenueOrders.length : 0;

  const splitOrders = windowOrders.filter((o) => {
    const members = readNum(o.memberCount, o.splitSize, o.maxMembers);
    return members > 1 || Boolean(o.isSplit) || Boolean(o.shareOrder);
  });
  const avgSplitValue = splitOrders.length
    ? splitOrders.reduce((s, o) => s + readNum(o.total, o.amount), 0) / splitOrders.length
    : 0;
  const splitCompletionRate = splitOrders.length
    ? splitOrders.filter((o) => {
        const s = readStr(o.status).toLowerCase();
        return s.includes('deliver') || s.includes('complete') || s.includes('paid');
      }).length / splitOrders.length
    : 0;

  const restaurantCounts = new Map<string, number>();
  const restaurantRevenue = new Map<string, number>();
  const mealCounts = new Map<string, number>();
  const cancelByRest = new Map<string, { total: number; cancelled: number }>();
  const locations = new Map<string, number>();

  for (const o of windowOrders) {
    const rest = readStr(o.restaurantName, o.partnerName) || 'Unknown';
    restaurantCounts.set(rest, (restaurantCounts.get(rest) ?? 0) + 1);
    const amt = readNum(o.total, o.amount, o.grandTotal);
    if (readStr(o.status, o.deliveryStatus).toLowerCase().includes('deliver') ||
        readStr(o.status).toLowerCase().includes('complete')) {
      restaurantRevenue.set(rest, (restaurantRevenue.get(rest) ?? 0) + amt);
    }
    const meal = readStr(o.foodName, o.mealName, o.itemName) || 'Meal';
    mealCounts.set(meal, (mealCounts.get(meal) ?? 0) + 1);
    const loc = readStr(o.city, o.location, o.deliveryCity) || 'Unknown';
    locations.set(loc, (locations.get(loc) ?? 0) + 1);
    const bucket = cancelByRest.get(rest) ?? { total: 0, cancelled: 0 };
    bucket.total += 1;
    if (readStr(o.status).toLowerCase().includes('cancel')) bucket.cancelled += 1;
    cancelByRest.set(rest, bucket);
  }

  const mostPopularRestaurant =
    [...restaurantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a';
  const mostPopularMeal =
    [...mealCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a';
  const topLocations = [...locations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const paySummary = summarizeAdminPayments(
    paymentTx.filter((t) => {
      const ms = t.createdAtMs;
      return typeof ms === 'number' && ms >= start && ms <= end;
    }),
  );

  const paymentExceptions: EmoAiPaymentException[] = [];
  for (const o of orders) {
    if (!isPaymentException(o)) continue;
    if (!inWindow(safeToMillis(o.createdAt)) && !inWindow(safeToMillis(o.updatedAt))) {
      // still include paid exceptions in window by createdAt primarily
      if (!inWindow(safeToMillis(o.createdAt))) continue;
    }
    paymentExceptions.push({
      orderId: o.id,
      customerName: readStr(o.customerName, o.userName, o.customerId) || 'Customer',
      restaurant: readStr(o.restaurantName, o.partnerName) || 'Restaurant',
      meal: readStr(o.foodName, o.mealName, o.itemName) || 'Meal',
      amount: readNum(o.total, o.amount, o.grandTotal),
      paymentStatus: readStr(o.paymentStatus) || 'paid',
      problem: classifyIssue(o) || 'Paid order with operational issue',
      resolutionStatus: readStr(o.resolutionStatus, o.refundStatus) || 'Open',
      refundAmount: readNum(o.refundAmount),
      refundStatus: readStr(o.refundStatus) || 'n/a',
      paymentTransactionId: readStr(o.paymentIntentId, o.stripePaymentIntentId, o.paymentTransactionId),
      orderTimeMs: safeToMillis(o.createdAt) ?? 0,
      location: readStr(o.city, o.location) || 'n/a',
      administratorNotes: readStr(o.adminNotes, o.notes),
    });
  }

  const issueMap = new Map<string, number>();
  for (const o of windowOrders) {
    const label = classifyIssue(o);
    if (!label) continue;
    issueMap.set(label, (issueMap.get(label) ?? 0) + 1);
  }
  const customerIssues: EmoAiCustomerIssueBucket[] = [...issueMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      count,
      trendNote: count >= 5 ? 'Elevated volume — monitor closely' : 'Within normal range',
    }));

  const conversationSummary = await summarizeConversationThemes(start, end);
  const { insights, recommendations, highPriorityConversations } =
    buildEmoAiInsightsAndRecommendations({
      period,
      newOrders: windowOrders.length,
      completed: completedOrders.length,
      cancelled: cancelledOrders.length,
      revenue,
      mostPopularMeal,
      mostPopularRestaurant,
      paymentExceptions,
      customerIssues,
      restaurantCancellations: [...cancelByRest.entries()].map(([name, v]) => ({
        name,
        rate: v.total ? v.cancelled / v.total : 0,
      })),
      conversationSummary,
    });

  const emoConversations = await listEmoAiConversations().catch(() => []);
  const periodConversations = emoConversations.filter(
    (c) => c.lastActivityMs >= start && c.lastActivityMs <= end,
  );
  const convoAnalytics = buildEmoConversationAnalytics(periodConversations);
  const convoInsights = buildEmoConversationInsights(periodConversations);
  const userConversations = {
    analytics: convoAnalytics,
    insights: convoInsights,
    highPriorityConversations: periodConversations
      .filter((c) => c.highPriority || c.flagged)
      .slice(0, 40)
      .map((c) => ({
        userId: c.userId,
        userName: c.userName,
        title: c.title,
        lastActivityMs: c.lastActivityMs,
      })),
    conversationCountInPeriod: periodConversations.length,
  };

  const returningUsers = Math.max(0, activeUserIds.size - newUsers);

  const searchText = [
    title,
    period,
    mostPopularRestaurant,
    mostPopularMeal,
    ...topLocations,
    ...paymentExceptions.map((e) => e.orderId),
    `conversations:${userConversations.conversationCountInPeriod}`,
  ]
    .join(' ')
    .toLowerCase();

  return {
    period,
    title,
    generatedAtMs: Date.now(),
    periodStartMs: start,
    periodEndMs: end,
    searchText,
    executiveSummary: {
      newUsers,
      activeUsers: activeUserIds.size,
      returningUsers,
      newOrders: windowOrders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      failedOrders: failedOrders.length,
      revenue,
      averageOrderValue: aov,
      averageSplitValue: avgSplitValue,
      mostPopularRestaurant,
      mostPopularMeal,
      topLocations,
    },
    ordersAnalytics: {
      totalOrders: windowOrders.length,
      completed: completedOrders.length,
      pending: pendingOrders.length,
      cancelled: cancelledOrders.length,
      failed: failedOrders.length,
      active: activeOrders.length,
      avgDeliveryMinutes: null,
      splitCompletionRate,
    },
    restaurantAnalytics: {
      mostPopular: [...restaurantCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, orders]) => ({ name, orders })),
      highestRevenue: [...restaurantRevenue.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, rev]) => ({ name, revenue: rev })),
      mostOrderedMeals: [...mealCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count })),
      avgPreparationMinutes: null,
      cancellationRateByRestaurant: [...cancelByRest.entries()]
        .map(([name, v]) => ({
          name,
          rate: v.total ? v.cancelled / v.total : 0,
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 8),
    },
    paymentAnalytics: {
      successful: paySummary.successfulCount,
      failed: paySummary.failedCount,
      pending: paySummary.pendingCount,
      refunds: paySummary.refundedCount,
      revenue: paySummary.grossRevenue,
      averagePayment: paySummary.successfulCount
        ? paySummary.grossRevenue / paySummary.successfulCount
        : 0,
      successRate:
        paySummary.successfulCount + paySummary.failedCount
          ? paySummary.successfulCount /
            (paySummary.successfulCount + paySummary.failedCount)
          : 0,
    },
    paymentExceptions: paymentExceptions.slice(0, 100),
    customerIssues,
    conversationSummary,
    highPriorityConversations,
    insights,
    recommendations,
    userConversations,
  };
}
