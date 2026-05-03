import {
  AdminFoodCatalogFab,
  AdminFoodCatalogList,
  AdminFoodCatalogProvider,
} from './components/AdminFoodCatalog';
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
  countFoodCardsWithStatus,
  countVisibleActiveFoodCardsInSnapshot,
} from '../../../services/foodCards';
import { useRouter } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
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

const PAGE_BG = '#f8fafc';
const PRIMARY = '#16a34a';

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
      const [usersSnap, ordersSnap, cardsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'food_cards')),
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

      const activeCards = countVisibleActiveFoodCardsInSnapshot(cardsSnap, now);
      const totalMatches = countFoodCardsWithStatus(cardsSnap, 'matched');

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
        totalRevenue: sumPrice,
      };
      adminLog('admin-home', 'metrics loaded', nextMetrics);
      setMetrics(nextMetrics);
      setError(null);
    } catch (e) {
      adminError('admin-home', 'fetchMetrics failed', e);
      setMetrics(null);
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
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
        <AdminFoodCatalogProvider enabled={isAdmin}>
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
                      hint="All-time total"
                      onPress={() => router.push(adminRoutes.orders() as never)}
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
              </View>

              <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                Food management
              </Text>
              <View style={styles.panel}>
                <AdminCardsDashboard />
              </View>

              <Text style={[styles.sectionHeading, styles.sectionSpacer]}>
                Home menu catalog
              </Text>
              <Text style={styles.panelHint}>
                Up to 10 templates on the Home tab. Tap a card to edit; use +
                below to add.
              </Text>
              <View style={styles.catalogSection}>
                <AdminFoodCatalogList />
                <AdminFoodCatalogFab />
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
        </AdminFoodCatalogProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: PAGE_BG },
  mainCol: { flex: 1 },
  scrollView: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: { padding: 16, paddingBottom: 48 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
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
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  panelHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 18,
  },
  catalogSection: {
    position: 'relative',
    minHeight: 120,
    paddingBottom: 72,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  devSep: { fontSize: 13, color: '#94a3b8' },
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
