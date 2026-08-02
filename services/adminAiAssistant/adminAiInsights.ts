/**
 * Snapshot insights for the Admin AI Assistant.
 * Uses the same collections the Admin Dashboard already reads.
 */
import {
  fetchAdminPaymentTransactions,
  summarizeAdminPayments,
} from '@/services/adminPaymentCenter';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export type AdminAiInsightBundle = {
  text: string;
  proactive: string[];
};

export async function buildAdminAiInsights(
  insightKey: string | null,
): Promise<AdminAiInsightBundle> {
  const todayStart = startOfTodayMs();
  const [
    usersSnap,
    ordersSnap,
    restaurantsSnap,
    driversSnap,
    reportsSnap,
    paymentRows,
    supportSnap,
  ] = await Promise.all([
    getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500))),
    getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500))),
    getDocs(collection(db, 'restaurants')),
    getDocs(collection(db, 'drivers')),
    getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200))),
    fetchAdminPaymentTransactions().catch(() => []),
    getDocs(collection(db, 'supportConversations')).catch(async () => ({
      docs: [] as { data: () => Record<string, unknown> }[],
    })),
  ]);

  const paymentSummary = summarizeAdminPayments(paymentRows);

  let newUsersToday = 0;
  let newRestaurantsToday = 0;
  usersSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const ms = safeToMillis(data.createdAt);
    if (ms != null && ms >= todayStart) newUsersToday += 1;
  });
  restaurantsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const ms = safeToMillis(data.createdAt);
    if (ms != null && ms >= todayStart) newRestaurantsToday += 1;
  });

  let ordersToday = 0;
  let completedToday = 0;
  let activeDeliveries = 0;
  let abandoned = 0;
  const restaurantCounts = new Map<string, number>();
  const driverCounts = new Map<string, number>();
  const customerCounts = new Map<string, number>();

  ordersSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const ms = safeToMillis(data.createdAt);
    const status = (asString(data.status) || '').toLowerCase();
    const today = ms != null && ms >= todayStart;
    if (today) ordersToday += 1;
    if (today && (status === 'completed' || status === 'delivered')) {
      completedToday += 1;
    }
    if (
      status === 'out_for_delivery' ||
      status === 'picked_up' ||
      status === 'delivering' ||
      status === 'on_the_way'
    ) {
      activeDeliveries += 1;
    }
    if (
      today &&
      (status === 'cancelled' ||
        status === 'canceled' ||
        status === 'abandoned' ||
        status === 'awaiting_payment')
    ) {
      abandoned += 1;
    }
    const rName =
      asString(data.restaurantName) || asString(data.restaurantId) || null;
    if (rName && (status === 'completed' || status === 'delivered')) {
      restaurantCounts.set(rName, (restaurantCounts.get(rName) ?? 0) + 1);
    }
    const driverId = asString(data.driverId);
    if (driverId && (status === 'completed' || status === 'delivered')) {
      driverCounts.set(driverId, (driverCounts.get(driverId) ?? 0) + 1);
    }
    const customerId =
      asString(data.customerId) || asString(data.userId) || null;
    if (customerId) {
      customerCounts.set(customerId, (customerCounts.get(customerId) ?? 0) + 1);
    }
  });

  let pendingRestaurants = 0;
  restaurantsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (data.adminEnabled === false || data.pendingApproval === true) {
      pendingRestaurants += 1;
    }
  });

  let pendingDrivers = 0;
  driversSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (
      data.adminSuspended === true ||
      data.verified === false ||
      data.verificationStatus === 'pending'
    ) {
      pendingDrivers += 1;
    }
  });

  const reportCounts = new Map<string, number>();
  let reportsToday = 0;
  reportsSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const ms = safeToMillis(data.createdAt);
    if (ms != null && ms >= todayStart) reportsToday += 1;
    const uid =
      asString(data.reportedUserId) || asString(data.reportedUid) || null;
    if (uid) reportCounts.set(uid, (reportCounts.get(uid) ?? 0) + 1);
  });

  let unreadSupport = 0;
  const supportDocs = Array.isArray((supportSnap as { docs?: unknown }).docs)
    ? (supportSnap as { docs: { data: () => Record<string, unknown> }[] }).docs
    : [];
  supportDocs.forEach((d) => {
    const data = d.data();
    const n = typeof data.unreadAdmin === 'number' ? data.unreadAdmin : 0;
    if (n > 0) unreadSupport += 1;
  });

  const topRestaurants = [...restaurantCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topDrivers = [...driverCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const mostReported = [...reportCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const mostActive = [...customerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const proactive: string[] = [];
  if (paymentSummary.refundedCount >= 3) {
    proactive.push(
      `High refunds detected: ${paymentSummary.refundedCount} refunded charges in the payment ledger.`,
    );
  }
  if (pendingRestaurants > 0) {
    proactive.push(
      `${pendingRestaurants} restaurant(s) may need approval or are disabled.`,
    );
  }
  if (pendingDrivers > 0) {
    proactive.push(
      `${pendingDrivers} driver account(s) look suspended or unverified.`,
    );
  }
  if (paymentSummary.failedCount > 0) {
    proactive.push(
      `Payment failures detected: ${paymentSummary.failedCount} failed charge(s).`,
    );
  }
  if (reportsToday >= 3) {
    proactive.push(`Spike in complaints/reports today: ${reportsToday}.`);
  }
  if (unreadSupport > 0) {
    proactive.push(`Unread support conversations: ${unreadSupport}.`);
  }
  if (abandoned >= 5) {
    proactive.push(
      `Abandoned / unpaid orders today: ${abandoned}.`,
    );
  }

  const money = (n: number) =>
    `CA$${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`;

  const overview = [
    'Here’s a live operations snapshot:',
    '',
    `• New users today: ${newUsersToday}`,
    `• New restaurants today: ${newRestaurantsToday}`,
    `• Orders today: ${ordersToday}`,
    `• Completed deliveries today: ${completedToday}`,
    `• Active deliveries now: ${activeDeliveries}`,
    `• Revenue (payment center): ${money(paymentSummary.grossRevenue)}`,
    `• Revenue today: ${money(paymentSummary.revenueToday)}`,
    `• Successful payments: ${paymentSummary.successfulCount}`,
    `• Failed payments: ${paymentSummary.failedCount}`,
    `• Refunds: ${paymentSummary.refundedCount}`,
    `• Unread support threads: ${unreadSupport}`,
    `• Reports today: ${reportsToday}`,
  ].join('\n');

  let text = overview;
  switch (insightKey) {
    case 'refunds':
      text = `Refunds in the payment ledger: ${paymentSummary.refundedCount}.\nOpen Payments to review details.`;
      break;
    case 'failed_payments':
      text = `Failed payments: ${paymentSummary.failedCount}.\nOpen Payments to investigate.`;
      break;
    case 'revenue':
      text = [
        'Payment summary',
        `• Total revenue: ${money(paymentSummary.grossRevenue)}`,
        `• Today: ${money(paymentSummary.revenueToday)}`,
        `• This week: ${money(paymentSummary.revenueThisWeek)}`,
        `• Successful: ${paymentSummary.successfulCount}`,
        `• Pending: ${paymentSummary.pendingCount}`,
        `• Refunded: ${paymentSummary.refundedCount}`,
        `• Failed: ${paymentSummary.failedCount}`,
      ].join('\n');
      break;
    case 'new_users':
      text = `New users created today: ${newUsersToday}.`;
      break;
    case 'restaurants':
      text = `New restaurants today: ${newRestaurantsToday}.\nPending / disabled restaurants: ${pendingRestaurants}.`;
      break;
    case 'completed':
      text = `Completed deliveries today: ${completedToday}.`;
      break;
    case 'live_deliveries':
      text = `Active deliveries right now: ${activeDeliveries}.\nI can open Orders → Active for the full list.`;
      break;
    case 'top_restaurants':
      text =
        topRestaurants.length === 0
          ? 'Not enough completed-order data yet for top restaurants.'
          : [
              'Top restaurants (by completed orders in recent sample):',
              ...topRestaurants.map(
                ([name, count], i) => `${i + 1}. ${name} — ${count}`,
              ),
            ].join('\n');
      break;
    case 'top_drivers':
      text =
        topDrivers.length === 0
          ? 'Not enough completed-order data yet for top drivers.'
          : [
              'Top drivers (by completed deliveries in recent sample):',
              ...topDrivers.map(
                ([id, count], i) => `${i + 1}. ${id.slice(0, 10)}… — ${count}`,
              ),
            ].join('\n');
      break;
    case 'reports':
      text =
        mostReported.length === 0
          ? `Reports today: ${reportsToday}. No frequent reported users in this sample.`
          : [
              `Reports today: ${reportsToday}`,
              'Most reported users:',
              ...mostReported.map(
                ([id, count], i) => `${i + 1}. ${id.slice(0, 10)}… — ${count}`,
              ),
            ].join('\n');
      break;
    case 'verification':
      text = `Drivers needing attention (suspended/unverified signals): ${pendingDrivers}.\nOpen Drivers to review.`;
      break;
    case 'support':
      text = `Unread support conversations: ${unreadSupport}.\nOpen Support Inbox to respond.`;
      break;
    default:
      if (mostActive.length) {
        text +=
          '\n\nMost active customers (sample):\n' +
          mostActive
            .map(([id, count], i) => `${i + 1}. ${id.slice(0, 10)}… — ${count} orders`)
            .join('\n');
      }
      break;
  }

  if (proactive.length) {
    text +=
      '\n\nProactive alerts:\n' +
      proactive.map((p) => `• ${p}`).join('\n');
  }

  return { text, proactive };
}
