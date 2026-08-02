/**
 * Fetches real-time Firestore data for the Admin AI assistant.
 * Builds a rich platformContext string passed to OpenAI so the AI
 * can answer questions about orders, users, restaurants, drivers, referrals.
 */
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(): number {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function buildAdminLiveContext(): Promise<string> {
  const todayMs = startOfDayMs();
  const weekMs = startOfWeekMs();

  try {
    const [usersSnap, ordersSnap, restaurantsSnap, driversSnap, referralsSnap, matchesSnap, activitySnap] =
      await Promise.all([
        getDocs(query(collection(db, 'users'), limit(500))),
        getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(200))),
        getDocs(query(collection(db, 'restaurants'), limit(100))),
        getDocs(query(collection(db, 'drivers'), limit(100))),
        getDocs(query(collection(db, 'friendReferrals'), orderBy('createdAt', 'desc'), limit(50))),
        getDocs(query(collection(db, 'matches'), limit(100))),
        getDocs(query(collection(db, 'userActivity'), orderBy('lastActiveAt', 'desc'), limit(50))),
      ]);

    // ── Users ────────────────────────────────────────────────
    let newUsersToday = 0;
    let newUsersWeek = 0;
    const roleCount: Record<string, number> = {};
    usersSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const ms = safeToMillis(data.createdAt) ?? 0;
      if (ms >= todayMs) newUsersToday++;
      if (ms >= weekMs) newUsersWeek++;
      const role = asStr(data.role) || 'user';
      roleCount[role] = (roleCount[role] ?? 0) + 1;
    });

    // ── Orders ───────────────────────────────────────────────
    let ordersToday = 0;
    let ordersWeek = 0;
    let paidOrders = 0;
    let completedOrders = 0;
    let pendingOrders = 0;
    let revenueToday = 0;
    let revenueWeek = 0;
    const recentOrders: string[] = [];

    ordersSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const ms = safeToMillis(data.createdAt) ?? 0;
      const status = asStr(data.status).toLowerCase();
      const payStatus = asStr(data.paymentStatus).toLowerCase();
      const price = asNum(data.totalPrice);
      const customer = asStr(data.customerName) || 'Customer';
      const restaurant = asStr(data.restaurantName) ||
        (data.restaurant as Record<string, unknown>)?.name as string || '';

      if (ms >= todayMs) {
        ordersToday++;
        if (payStatus === 'paid') revenueToday += price;
      }
      if (ms >= weekMs) {
        ordersWeek++;
        if (payStatus === 'paid') revenueWeek += price;
      }
      if (payStatus === 'paid') paidOrders++;
      if (status === 'completed' || status === 'delivered') completedOrders++;
      if (status === 'pending' || status === 'accepted' || status === 'preparing') pendingOrders++;

      if (recentOrders.length < 10 && ms >= todayMs) {
        recentOrders.push(
          `  - #${d.id.slice(-6).toUpperCase()} | ${customer} | ${restaurant} | CA$${price.toFixed(2)} | ${status} | ${payStatus}`,
        );
      }
    });

    // ── Restaurants ──────────────────────────────────────────
    let openRestaurants = 0;
    const restaurantNames: string[] = [];
    restaurantsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data.isOpen) openRestaurants++;
      const name = asStr(data.name);
      if (name && restaurantNames.length < 10) restaurantNames.push(name);
    });

    // ── Drivers ──────────────────────────────────────────────
    let onlineDrivers = 0;
    let totalDrivers = driversSnap.size;
    driversSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data.isOnline || data.online) onlineDrivers++;
    });

    // ── Referrals (friendReferrals) ───────────────────────────
    const recentReferrals: string[] = [];
    let referralSuccessful = 0;
    let referralPending = 0;
    referralsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const inviter = asStr(data.inviterId).slice(0, 8);
      const invited = asStr(data.friendUid || data.invitedUserId).slice(0, 8);
      const status = asStr(data.status);
      const ms = safeToMillis(data.createdAt);
      const date = ms ? new Date(ms).toLocaleDateString() : '?';
      if (status === 'reward_issued' || status === 'completed_first_order') referralSuccessful++;
      else referralPending++;
      if (recentReferrals.length < 10) {
        recentReferrals.push(`  - Inviter:${inviter} -> Invited:${invited} | ${status} | ${date}`);
      }
    });

    // ── Food Share Matches ────────────────────────────────────
    let activeMatches = 0;
    matchesSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const lc = asStr(data.lifecycle).toUpperCase();
      if (lc === 'MATCHED' || lc === 'PAYMENT_CONFIRMED') activeMatches++;
    });

    // ── Build context string ─────────────────────────────────
    const lines = [
      '=== LIVE HALFORDER ADMIN DATA (fetched now) ===',
      '',
      '## USERS',
      `Total users: ${usersSnap.size}`,
      `New today: ${newUsersToday} | New this week: ${newUsersWeek}`,
      `Roles: ${Object.entries(roleCount).map(([r, c]) => `${r}:${c}`).join(', ')}`,
      '',
      '## ORDERS',
      `Total orders: ${ordersSnap.size}`,
      `Today: ${ordersToday} | This week: ${ordersWeek}`,
      `Paid: ${paidOrders} | Completed: ${completedOrders} | Pending/Active: ${pendingOrders}`,
      `Revenue today: CA$${revenueToday.toFixed(2)} | Revenue this week: CA$${revenueWeek.toFixed(2)}`,
      recentOrders.length > 0
        ? `Recent today's orders:\n${recentOrders.join('\n')}`
        : 'No orders today yet.',
      '',
      '## RESTAURANTS',
      `Total: ${restaurantsSnap.size} | Open now: ${openRestaurants}`,
      restaurantNames.length > 0 ? `Names: ${restaurantNames.join(', ')}` : '',
      '',
      '## DRIVERS',
      `Total drivers: ${totalDrivers} | Online now: ${onlineDrivers}`,
      '',
      '## REFERRALS (Customer)',
      `Total referrals: ${referralsSnap.size} | Successful: ${referralSuccessful} | Pending: ${referralPending}`,
      recentReferrals.length > 0
        ? `Recent:\n${recentReferrals.join('\n')}`
        : 'No customer referrals yet.',
      '',
      '## USER ACTIVITY (last 50 active users)',
      ...(() => {
        const now = Date.now();
        let active1h = 0; let active24h = 0;
        const recentActivity: string[] = [];
        activitySnap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const ms = safeToMillis(data.lastActiveAt) ?? 0;
          if (now - ms < 3_600_000) active1h++;
          if (now - ms < 86_400_000) active24h++;
          if (recentActivity.length < 10) {
            const name = asStr(data.displayName) || d.id.slice(0, 8);
            const page = asStr(data.lastPage) || '?';
            const count = asNum(data.signInCount);
            recentActivity.push(`  - ${name} | last: ${page} | sign-ins: ${count}`);
          }
        });
        return [
          `Active last 1h: ${active1h} | Active last 24h: ${active24h} | Total tracked: ${activitySnap.size}`,
          recentActivity.length > 0 ? `Recent active users:\n${recentActivity.join('\n')}` : 'No activity tracked yet.',
        ];
      })(),
      '',
      '## FOOD SHARE',
      `Active matches: ${activeMatches} | Total matches: ${matchesSnap.size}`,
      '',
      '=== END LIVE DATA ===',
      '',
      'You are the Admin AI for HalfOrder. Use the live data above to answer the admin\'s question accurately.',
      'Be concise and direct. Format numbers clearly. If asked about a specific user/order/driver, say you can navigate to their page.',
    ];

    return lines.filter((l) => l !== undefined).join('\n');
  } catch (e) {
    return 'Live data temporarily unavailable — answer based on your general HalfOrder knowledge.';
  }
}
