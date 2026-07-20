/**
 * Scheduled Emo AI executive reports (daily / weekly / monthly).
 * Stores structured reports in Firestore `emoAiReports` for the Admin dashboard.
 */
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {onSchedule} from "firebase-functions/v2/scheduler";

const db = getFirestore();
const COLLECTION = "emoAiReports";

type Period = "daily" | "weekly" | "monthly";

function periodWindow(period: Period, now = Date.now()): {
  start: number;
  end: number;
  title: string;
} {
  const end = now;
  const d = new Date(now);
  if (period === "daily") {
    d.setUTCHours(0, 0, 0, 0);
    return {
      start: d.getTime(),
      end,
      title: `HalfOrder Daily Executive Report — ${d.toISOString().slice(0, 10)}`,
    };
  }
  if (period === "weekly") {
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return {
      start: d.getTime(),
      end,
      title: `HalfOrder Weekly Executive Report — week of ${d.toISOString().slice(0, 10)}`,
    };
  }
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return {
    start: d.getTime(),
    end,
    title: `HalfOrder Monthly Executive Report — ${d.toISOString().slice(0, 7)}`,
  };
}

function readStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readNum(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return 0;
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in (value as object)) {
    try {
      return (value as {toMillis: () => number}).toMillis();
    } catch {
      return 0;
    }
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

async function buildAndStore(period: Period): Promise<string> {
  const {start, end, title} = periodWindow(period);
  const [usersSnap, ordersSnap, paymentsSnap] = await Promise.all([
    db.collection("users").limit(5000).get(),
    db.collection("orders").limit(5000).get(),
    db.collection("paymentTransactions").limit(5000).get(),
  ]);

  type Row = Record<string, unknown> & {id: string};
  const orders: Row[] = ordersSnap.docs.map((d) => ({id: d.id, ...(d.data() as Record<string, unknown>)}));
  const windowOrders = orders.filter((o) => {
    const ms = toMillis(o.createdAt);
    return ms >= start && ms <= end;
  });

  const completed = windowOrders.filter((o) => {
    const s = readStr(o.status, o.deliveryStatus).toLowerCase();
    return s.includes("deliver") || s.includes("complete");
  });
  const cancelled = windowOrders.filter((o) =>
    readStr(o.status).toLowerCase().includes("cancel"),
  );
  const failed = windowOrders.filter((o) => {
    const s = readStr(o.status, o.paymentStatus).toLowerCase();
    return s.includes("fail");
  });
  const revenue = completed.reduce(
    (sum, o) => sum + readNum(o.total, o.amount, o.grandTotal),
    0,
  );

  const restaurantCounts = new Map<string, number>();
  const mealCounts = new Map<string, number>();
  for (const o of windowOrders) {
    const rest = readStr(o.restaurantName, o.partnerName) || "Unknown";
    restaurantCounts.set(rest, (restaurantCounts.get(rest) ?? 0) + 1);
    const meal = readStr(o.foodName, o.mealName, o.itemName) || "Meal";
    mealCounts.set(meal, (mealCounts.get(meal) ?? 0) + 1);
  }
  const mostPopularRestaurant =
    [...restaurantCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a";
  const mostPopularMeal =
    [...mealCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a";

  const paymentExceptions: Record<string, unknown>[] = [];
  for (const o of windowOrders) {
    const pay = readStr(o.paymentStatus).toLowerCase();
    const status = readStr(o.status).toLowerCase();
    const paid = pay === "paid" || pay === "succeeded" || Boolean(o.paidAt);
    if (!paid) continue;
    if (
      !(
        status.includes("cancel") ||
        status.includes("fail") ||
        readStr(o.refundStatus).toLowerCase().includes("refund")
      )
    ) {
      continue;
    }
    paymentExceptions.push({
      orderId: o.id,
      customerName: readStr(o.customerName, o.userId) || "Customer",
      restaurant: readStr(o.restaurantName, o.partnerName) || "Restaurant",
      meal: readStr(o.foodName, o.mealName) || "Meal",
      amount: readNum(o.total, o.amount),
      paymentStatus: pay || "paid",
      problem: "Paid order with operational issue",
      resolutionStatus: readStr(o.resolutionStatus, o.refundStatus) || "Open",
      refundAmount: readNum(o.refundAmount),
      refundStatus: readStr(o.refundStatus) || "n/a",
      paymentTransactionId: readStr(
        o.paymentIntentId,
        o.stripePaymentIntentId,
        o.paymentTransactionId,
      ),
      orderTimeMs: toMillis(o.createdAt),
      location: readStr(o.city, o.location) || "n/a",
      administratorNotes: readStr(o.adminNotes),
    });
  }

  const newUsers = usersSnap.docs.filter((d) => {
    const ms = toMillis((d.data() as Record<string, unknown>).createdAt);
    return ms >= start && ms <= end;
  }).length;

  const paidTx = paymentsSnap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    const ms = toMillis(data.createdAt);
    if (ms < start || ms > end) return false;
    const st = readStr(data.status).toLowerCase();
    return st === "paid" || st === "succeeded";
  });
  const payRevenue = paidTx.reduce(
    (s, d) => s + readNum((d.data() as Record<string, unknown>).amount),
    0,
  );

  const id = `${period}_${new Date().toISOString().slice(0, 10)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const report = {
    id,
    period,
    title,
    status: "ready",
    generatedAtMs: Date.now(),
    periodStartMs: start,
    periodEndMs: end,
    searchText: `${title} ${period} ${mostPopularRestaurant} ${mostPopularMeal}`.toLowerCase(),
    pdfStoragePath: null,
    pdfDownloadUrl: null,
    archived: false,
    executiveSummary: {
      newUsers,
      activeUsers: new Set(
        windowOrders.map((o) => readStr(o.userId, o.customerId)).filter(Boolean),
      ).size,
      returningUsers: 0,
      newOrders: windowOrders.length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      failedOrders: failed.length,
      revenue,
      averageOrderValue: completed.length ? revenue / completed.length : 0,
      averageSplitValue: 0,
      mostPopularRestaurant,
      mostPopularMeal,
      topLocations: [],
    },
    ordersAnalytics: {
      totalOrders: windowOrders.length,
      completed: completed.length,
      pending: 0,
      cancelled: cancelled.length,
      failed: failed.length,
      active: Math.max(0, windowOrders.length - completed.length - cancelled.length),
      avgDeliveryMinutes: null,
      splitCompletionRate: 0,
    },
    restaurantAnalytics: {
      mostPopular: [...restaurantCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, orders]) => ({name, orders})),
      highestRevenue: [],
      mostOrderedMeals: [...mealCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({name, count})),
      avgPreparationMinutes: null,
      cancellationRateByRestaurant: [],
    },
    paymentAnalytics: {
      successful: paidTx.length,
      failed: 0,
      pending: 0,
      refunds: 0,
      revenue: payRevenue,
      averagePayment: paidTx.length ? payRevenue / paidTx.length : 0,
      successRate: 1,
    },
    paymentExceptions,
    customerIssues: [],
    conversationSummary: [
      {theme: "Users asked about pizza", count: 0},
      {theme: "Searched for cheaper meals", count: 0},
      {theme: "Asked about delivery", count: 0},
    ],
    highPriorityConversations: paymentExceptions.slice(0, 8).map((x) => ({
      userId: String(x.customerName),
      userName: String(x.customerName),
      summary: `${String(x.problem)} — order ${String(x.orderId)}`,
      priority: "high",
      recommendedAction: "Review fulfillment and refund status",
    })),
    insights: [
      `${mostPopularMeal} is the top meal signal this ${period} period.`,
      `${paymentExceptions.length} payment exception(s) flagged for review.`,
      `Completed-order revenue: $${revenue.toFixed(2)}.`,
    ],
    recommendations: [
      "Investigate restaurants with elevated cancellations.",
      "Prioritize Payment Exception Report items.",
      "Promote top-performing restaurants during peak hours.",
    ],
    createdAt: FieldValue.serverTimestamp(),
  };

  await db.collection(COLLECTION).doc(id).set(report);
  return id;
}

/** Daily executive report — 06:00 America/Toronto. */
export const generateEmoAiDailyReport = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "America/Toronto",
    retryCount: 1,
  },
  async () => {
    const id = await buildAndStore("daily");
    logger.info("[emoAiReports] daily stored", {id});
  },
);

/** Weekly executive report — Mondays 06:15 America/Toronto. */
export const generateEmoAiWeeklyReport = onSchedule(
  {
    schedule: "15 6 * * 1",
    timeZone: "America/Toronto",
    retryCount: 1,
  },
  async () => {
    const id = await buildAndStore("weekly");
    logger.info("[emoAiReports] weekly stored", {id});
  },
);

/** Monthly executive report — 1st of month 06:30 America/Toronto. */
export const generateEmoAiMonthlyReport = onSchedule(
  {
    schedule: "30 6 1 * *",
    timeZone: "America/Toronto",
    retryCount: 1,
  },
  async () => {
    const id = await buildAndStore("monthly");
    logger.info("[emoAiReports] monthly stored", {id});
  },
);
