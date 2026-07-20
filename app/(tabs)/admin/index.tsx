import { AdminCardsDashboard } from './components/AdminCardsDashboard';
import { ActionCard } from '../../../components/ActionCard';
import { AdminStatCard } from '../../../components/AdminStatCard';
import { AdminHeader } from '../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../constants/adminRoutes';
import { ADMIN_PANEL_EMAIL, isAdminUser } from '../../../constants/adminUid';
import { goHome } from '../../../lib/navigation';
import { adminError, adminLog } from '../../../lib/admin/adminDebug';
import { adminColors as COLORS } from '../../../constants/adminTheme';
import { useAuth } from '../../../services/AuthContext';
import { db } from '../../../services/firebase';
import {
  countActiveAdminFoodSharesInSnapshot,
} from '@/services/adminFoodSharesService';
import {
  fetchAdminPaymentTransactions,
  summarizeAdminPayments,
} from '@/services/adminPaymentCenter';
import type { AdminPaymentSummary } from '@/types/adminPaymentTransaction';
import { useRouter } from 'expo-router';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { ADMIN_FOOD_CARD_SLOT_IDS } from '../../../constants/adminFoodCards';
import { countFoodCardsWithStatus } from '../../../services/foodCards';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getReadableErrorMessageOr } from '../../../utils/errorMessages';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(): number {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const PRIMARY = COLORS.primary;

export default function AdminScreen() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const { user, firestoreUserRole } = useAuth();
  const [screenReady, setScreenReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<{
    totalUsers: number;
    totalOrders: number;
    ordersToday: number;
    ordersThisWeek: number;
    activeUsers: number;
    averageOrderPrice: number;
    activeCards: number;
    totalMatches: number;
    completedOrders: number;
    totalRevenue: number;
    foodShareRevenue: number;
    foodSharePaid: number;
    foodShareRefunds: number;
    foodShareFailed: number;
    activeFoodShareMatches: number;
    paymentSummary: AdminPaymentSummary | null;
    recentPaymentCount: number;
  } | null>(null);

  const isAdmin = isAdminUser(user, firestoreUserRole);
  const nonAdminRedirectRef = useRef(false);

  useEffect(() => {
    setScreenReady(true);
  }, []);

  useEffect(() => {
    if (!user) {
      nonAdminRedirectRef.current = false;
      return;
    }
    if (!isAdmin) {
      if (nonAdminRedirectRef.current) return;
      nonAdminRedirectRef.current = true;
      goHome();
      return;
    }
    nonAdminRedirectRef.current = false;
  }, [isAdmin, user?.uid]);

  const fetchMetrics = useCallback(async () => {
    try {
      adminLog('admin-home', 'fetchMetrics: users, orders, food_cards');
      const [usersSnap, ordersSnap, cardsSnap, adminSharesSnap, paymentsSnap, matchesSnap, paymentTxRows] =
        await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'food_cards')),
        getDocs(
          query(
            collection(db, 'adminFoodShares'),
            where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
          ),
        ),
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'matches')),
        fetchAdminPaymentTransactions(),
      ]);

      const totalUsers = usersSnap.size;
      const totalOrders = ordersSnap.size;
      const todayStart = startOfTodayMs();
      const weekStart = startOfWeekMs();
      const now = Date.now();
      let ordersToday = 0;
      let ordersThisWeek = 0;
      let sumPrice = 0;
      let completedOrders = 0;
      const activeUserIds = new Set<string>();

      ordersSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt = data?.createdAt;
        const ms =
          typeof createdAt?.toMillis === 'function'
            ? createdAt.toMillis()
            : typeof createdAt?.seconds === 'number'
              ? createdAt.seconds * 1000
              : 0;

        if (ms >= todayStart && ms <= now) ordersToday += 1;
        if (ms >= weekStart && ms <= now) {
          ordersThisWeek += 1;
          const ids = Array.isArray(data?.participants) ? data.participants : [];
          const hostId = data?.hostId ?? data?.creatorId ?? data?.userId;
          if (Array.isArray(ids)) ids.forEach((id: string) => activeUserIds.add(id));
          if (hostId) activeUserIds.add(hostId);
        }

        const orderPrice = data?.totalPrice ?? data?.price;
        if (typeof orderPrice === 'number' && !Number.isNaN(orderPrice)) {
          sumPrice += orderPrice;
        }
        if (data?.status === 'completed') completedOrders += 1;
      });

      const activeCards = countActiveAdminFoodSharesInSnapshot(adminSharesSnap);
      const totalMatches = countFoodCardsWithStatus(cardsSnap, 'matched');

      let foodShareRevenue = 0;
      let foodSharePaid = 0;
      let foodShareRefunds = 0;
      let foodShareFailed = 0;
      paymentsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.type !== 'food_share') return;
        const status = String(data.paymentStatus ?? '').toUpperCase();
        const amountCents =
          typeof data.amount === 'number' ? data.amount : 0;
        if (status === 'PAID') {
          foodSharePaid += 1;
          foodShareRevenue += amountCents / 100;
        } else if (status === 'REFUNDED') {
          foodShareRefunds += 1;
        } else if (status === 'FAILED') {
          foodShareFailed += 1;
        }
      });

      let activeFoodShareMatches = 0;
      matchesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const lifecycle = String(data?.lifecycle ?? '');
        if (lifecycle === 'MATCHED' || lifecycle === 'PAYMENT_CONFIRMED') {
          activeFoodShareMatches += 1;
        }
      });

      const paymentSummary = summarizeAdminPayments(paymentTxRows);

      const nextMetrics = {
        totalUsers,
        totalOrders,
        ordersToday,
        ordersThisWeek,
        activeUsers: activeUserIds.size,
        averageOrderPrice: totalOrders > 0 ? sumPrice / totalOrders : 0,
        activeCards,
        totalMatches,
        completedOrders,
        totalRevenue: paymentSummary.grossRevenue || sumPrice,
        foodShareRevenue: paymentSummary.foodShareRevenue || foodShareRevenue,
        foodSharePaid: paymentSummary.successfulCount || foodSharePaid,
        foodShareRefunds: paymentSummary.refundedCount || foodShareRefunds,
        foodShareFailed: paymentSummary.failedCount || foodShareFailed,
        activeFoodShareMatches,
        paymentSummary,
        recentPaymentCount: paymentTxRows.length,
      };
      adminLog('admin-home', 'metrics loaded', nextMetrics);
      setMetrics(nextMetrics);
      setError(null);
    } catch (e) {
      adminError('admin-home', 'fetchMetrics failed', e);
      setMetrics(null);
      setError(getReadableErrorMessageOr(e, 'Failed to load metrics'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) {
      fetchMetrics();
    } else {
      setLoading(false);
    }
  }, [fetchMetrics, isAdmin, user]);

  const onRefresh = () => {
    if (!isAdmin) return;
    setRefreshing(true);
    fetchMetrics();
  };

  if (!screenReady) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Preparing admin screen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Sign in to continue.</Text>
          <Text style={styles.link} onPress={goHome}>
            Go home
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Access denied</Text>
          <Text style={styles.hint}>
            You do not have permission to view this page. Admin sign-in:{' '}
            {ADMIN_PANEL_EMAIL}
          </Text>
          <Text style={styles.link} onPress={goHome}>
            Go home
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !metrics) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading admin...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const scrollPad = 16;
  const statGap = 12;
  const statCellW = (winW - scrollPad * 2 - statGap) / 2;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.mainCol}>
            <AdminHeader title="Admin Panel" />
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={PRIMARY}
                />
              }
            >
              <Text style={styles.title}>Admin Dashboard</Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {metrics ? (
                <>
                  <Text style={styles.sectionHeading}>Overview</Text>
                  <View style={styles.statsGrid}>
                    <AdminStatCard
                      label="Total Users"
                      value={String(metrics.totalUsers)}
                      hint="View directory"
                      onPress={() => router.push(adminRoutes.users as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Total Orders"
                      value={String(metrics.totalOrders)}
                      hint="Open orders"
                      onPress={() => router.push(adminRoutes.orders() as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Orders Today"
                      value={String(metrics.ordersToday)}
                      hint="Today filter"
                      onPress={() =>
                        router.push(
                          adminRoutes.orders({ filter: 'today' }) as never,
                        )
                      }
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Revenue"
                      value={`$${metrics.totalRevenue.toFixed(0)}`}
                      hint="Stripe treasury"
                      onPress={() => router.push(adminRoutes.payments as never)}
                      style={{ width: statCellW }}
                    />
                  </View>

                  <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                    Finance · Stripe Payments Center
                  </Text>
                  <View style={styles.statsGrid}>
                    <AdminStatCard
                      label="Revenue Today"
                      value={`$${(metrics.paymentSummary?.revenueToday ?? 0).toFixed(0)}`}
                      hint="Paid today"
                      onPress={() => router.push(adminRoutes.payments as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Revenue This Week"
                      value={`$${(metrics.paymentSummary?.revenueThisWeek ?? 0).toFixed(0)}`}
                      hint="Last 7 days"
                      onPress={() => router.push(adminRoutes.revenue as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Revenue This Month"
                      value={`$${(metrics.paymentSummary?.revenueThisMonth ?? 0).toFixed(0)}`}
                      hint="Calendar month"
                      onPress={() => router.push(adminRoutes.revenue as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Successful Payments"
                      value={String(metrics.paymentSummary?.successfulCount ?? metrics.foodSharePaid)}
                      hint="Paid charges"
                      onPress={() => router.push(adminRoutes.payments as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Pending"
                      value={String(metrics.paymentSummary?.pendingCount ?? 0)}
                      hint="Awaiting completion"
                      onPress={() => router.push(adminRoutes.payments as never)}
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Refunds"
                      value={String(metrics.paymentSummary?.refundedCount ?? metrics.foodShareRefunds)}
                      hint="Refunded charges"
                      onPress={() => router.push(adminRoutes.payments as never)}
                      style={{ width: statCellW }}
                    />
                  </View>

                  <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                    Meal share payments
                  </Text>
                  <View style={styles.statsGrid}>
                    <AdminStatCard
                      label="Share revenue"
                      value={`$${metrics.foodShareRevenue.toFixed(0)}`}
                      hint="Paid food shares"
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Successful"
                      value={String(metrics.foodSharePaid)}
                      hint="PAID payments"
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Refunds"
                      value={String(metrics.foodShareRefunds)}
                      hint="REFUNDED"
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Failed"
                      value={String(metrics.foodShareFailed)}
                      hint="FAILED payments"
                      style={{ width: statCellW }}
                    />
                    <AdminStatCard
                      label="Active matches"
                      value={String(metrics.activeFoodShareMatches)}
                      hint="Paid or confirming"
                      style={{ width: statCellW }}
                    />
                  </View>
                </>
              ) : null}

              <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                Actions
              </Text>
              <View style={styles.actionsGrid}>
                <ActionCard
                  icon="people-outline"
                  label="Users"
                  onPress={() => router.push(adminRoutes.users as never)}
                />
                <ActionCard
                  icon="receipt-outline"
                  label="Orders"
                  onPress={() => router.push(adminRoutes.orders() as never)}
                />
                <ActionCard
                  icon="flag-outline"
                  label="Reports"
                  onPress={() => router.push(adminRoutes.reports as never)}
                />
                <ActionCard
                  icon="notifications-outline"
                  label="Notify"
                  onPress={() =>
                    router.push(adminRoutes.sendNotification as never)
                  }
                />
                <ActionCard
                  icon="mail-outline"
                  label="Inbox Messages"
                  onPress={() =>
                    router.push(adminRoutes.inboxMessages as never)
                  }
                />
                <ActionCard
                  icon="chatbubbles-outline"
                  label="Support Inbox"
                  onPress={() =>
                    router.push(adminRoutes.supportInbox as never)
                  }
                />
                <ActionCard
                  icon="notifications-circle-outline"
                  label="Admin alerts"
                  onPress={() => router.push(adminRoutes.notifications as never)}
                />
                <ActionCard
                  icon="phone-portrait-outline"
                  label="Push Center"
                  onPress={() => router.push(adminRoutes.pushCenter as never)}
                />
                <ActionCard
                  icon="time-outline"
                  label="Notif History"
                  onPress={() =>
                    router.push(adminRoutes.notificationHistory as never)
                  }
                />
                <ActionCard
                  icon="albums-outline"
                  label="Onboarding"
                  onPress={() =>
                    router.push(adminRoutes.onboardingManager as never)
                  }
                />
                <ActionCard
                  icon="card-outline"
                  label="Payments"
                  onPress={() => router.push(adminRoutes.payments as never)}
                />
                <ActionCard
                  icon="pie-chart-outline"
                  label="Finance"
                  onPress={() => router.push(adminRoutes.finance as never)}
                />
                <ActionCard
                  icon="bar-chart-outline"
                  label="Revenue"
                  onPress={() => router.push(adminRoutes.revenue as never)}
                />
                <ActionCard
                  icon="shield-checkmark-outline"
                  label="Stripe setup"
                  onPress={() => router.push(adminRoutes.stripeDiagnostics as never)}
                />
                <ActionCard
                  icon="pricetag-outline"
                  label="Promo badges"
                  onPress={() => router.push(adminRoutes.promotionBadges as never)}
                />
                <ActionCard
                  icon="cash-outline"
                  label="Restaurant fees"
                  onPress={() => router.push(adminRoutes.restaurantFees as never)}
                />
                <ActionCard
                  icon="ticket-outline"
                  label="Promo codes"
                  onPress={() => router.push(adminRoutes.promoCodes as never)}
                />
                <ActionCard
                  icon="wallet-outline"
                  label="Balances"
                  onPress={() => router.push(adminRoutes.balances as never)}
                />
                <ActionCard
                  icon="images-outline"
                  label="Home banners"
                  onPress={() => router.push(adminRoutes.homeBanners as never)}
                />
                <ActionCard
                  icon="pricetags-outline"
                  label="Vouchers"
                  onPress={() => router.push(adminRoutes.vouchers as never)}
                />
                <ActionCard
                  icon="bulb-outline"
                  label="Emo AI Reports"
                  onPress={() => router.push(adminRoutes.emoAiReports as never)}
                />
              </View>

              <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                Home banners
              </Text>
              <View style={styles.panel}>
                <TouchableOpacity
                  style={styles.promoBadgesEntry}
                  onPress={() => router.push(adminRoutes.homeBanners as never)}
                  activeOpacity={0.88}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.promoBadgesTitle}>Home Banners</Text>
                    <Text style={styles.promoBadgesSub}>
                      Manage promotional carousel images, copy, and visibility on
                      Home
                    </Text>
                  </View>
                  <Text style={styles.promoBadgesCta}>Open</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                Food management
              </Text>
              <View style={styles.panel}>
                <TouchableOpacity
                  style={styles.promoBadgesEntry}
                  onPress={() =>
                    router.push(adminRoutes.promotionBadges as never)
                  }
                  activeOpacity={0.88}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.promoBadgesTitle}>Promotion Badges</Text>
                    <Text style={styles.promoBadgesSub}>
                      Choose Most Ordered or Great Price for each restaurant /
                      food card
                    </Text>
                  </View>
                  <Text style={styles.promoBadgesCta}>Open</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.panel, styles.sectionSpacer]}>
                <AdminCardsDashboard />
              </View>

              <View style={styles.devLinks}>
                <TouchableOpacity
                  onPress={() => router.push('/test' as never)}
                  hitSlop={8}
                >
                  <Text style={styles.devLink}>Test screen</Text>
                </TouchableOpacity>
                <Text style={styles.devSep}>·</Text>
                <TouchableOpacity
                  onPress={() => router.push(adminRoutes.aiInsights as never)}
                  hitSlop={8}
                >
                  <Text style={styles.devLink}>AI insights</Text>
                </TouchableOpacity>
                <Text style={styles.devSep}>·</Text>
                <TouchableOpacity
                  onPress={() => router.push(adminRoutes.dashboard as never)}
                  hitSlop={8}
                >
                  <Text style={styles.devLink}>Dashboard</Text>
                </TouchableOpacity>
                <Text style={styles.devSep}>·</Text>
                <TouchableOpacity
                  onPress={() => router.push(adminRoutes.analytics)}
                  hitSlop={8}
                >
                  <Text style={styles.devLink}>Analytics</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  mainCol: { flex: 1 },
  scrollView: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: { padding: 16, paddingBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  sectionSpacer: { marginTop: 20 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  panel: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  promoBadgesEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  promoBadgesTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  promoBadgesSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  promoBadgesCta: {
    fontSize: 14,
    fontWeight: '800',
    color: PRIMARY,
  },
  devLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
    gap: 6,
  },
  devLink: { fontSize: 13, fontWeight: '600', color: PRIMARY },
  devSep: { fontSize: 13, color: COLORS.textMuted },
  accessDenied: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  link: { fontSize: 16, color: PRIMARY, fontWeight: '600' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, fontSize: 14, fontWeight: '500' },
});
