import { useAuth } from '../../../services/AuthContext';
import { db } from '../../../services/firebase';
import { AdminHeader } from '../../../components/admin/AdminHeader';
import { collection, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { adminRoutes } from '../../../constants/adminRoutes';
import { isAdminUser } from '../../../constants/adminUid';
import { adminError, adminLog } from '../../../lib/admin/adminDebug';
import { adminCardShell, adminColors as COLORS } from '../../../constants/adminTheme';
import { theme } from '../../../constants/theme';
import { getReadableErrorMessageOr } from '../../../utils/errorMessages';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

type Stats = {
  totalUsers: number;
  totalOrders: number;
  activeOrders: number;
  pendingPayments: number;
  activeDeliveries: number;
  completedOrders: number;
  reportedUsers: number;
  complaints: number;
  ordersToday: number;
  reports: number;
};

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAdminUser(user, firestoreUserRole);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (!isAdminUser(user, firestoreUserRole)) {
      setLoading(false);
      return;
    }

    const state = {
      users: 0,
      complaints: 0,
      reports: [] as Record<string, unknown>[],
      orders: [] as Record<string, unknown>[],
    };

    const publish = () => {
      const todayStart = startOfTodayMs();
      const todayEnd = endOfTodayMs();
      const reportedUserIds = new Set<string>();
      let activeOrders = 0;
      let pendingPayments = 0;
      let activeDeliveries = 0;
      let completedOrders = 0;
      let ordersToday = 0;

      state.orders.forEach((data) => {
        const status = typeof data.status === 'string' ? data.status : '';
        const deliveryStatus =
          typeof data.deliveryStatus === 'string' ? data.deliveryStatus : '';
        if (
          ['open', 'active', 'matched', 'full', 'locked', 'ready_to_pay'].includes(status)
        ) {
          activeOrders += 1;
        }
        if (
          ['pending_payment', 'ready_to_pay', 'payment_pending'].includes(status) ||
          data.paymentStatus === 'unpaid' ||
          data.paymentStatus === 'processing'
        ) {
          pendingPayments += 1;
        }
        if (
          ['driver_assigned', 'picked_up', 'delivering'].includes(status) ||
          ['driver_assigned', 'picked_up', 'delivering'].includes(deliveryStatus)
        ) {
          activeDeliveries += 1;
        }
        if (status === 'completed' || deliveryStatus === 'delivered') {
          completedOrders += 1;
        }

        const rawCreated = data.createdAt;
        const created =
          rawCreated && typeof rawCreated === 'object' && 'toMillis' in rawCreated
            ? (rawCreated as { toMillis: () => number }).toMillis()
            : rawCreated ?? 0;
        const ms = typeof created === 'number' ? created : Number(created);
        if (ms >= todayStart && ms <= todayEnd) ordersToday += 1;
      });

      state.reports.forEach((data) => {
        const reportedUid = data.reportedUid ?? data.reportedUserId;
        if (typeof reportedUid === 'string' && reportedUid.length > 0) {
          reportedUserIds.add(reportedUid);
        }
      });

      const payload = {
        totalUsers: state.users,
        totalOrders: state.orders.length,
        activeOrders,
        pendingPayments,
        activeDeliveries,
        completedOrders,
        reportedUsers: reportedUserIds.size,
        complaints: state.complaints,
        ordersToday,
        reports: state.reports.length,
      };
      adminLog('dashboard', 'live stats updated', payload);
      setStats(payload);
      setError(null);
      setLoading(false);
    };

    const unsubs = [
      onSnapshot(collection(db, 'users'), (snap) => {
        state.users = snap.size;
        publish();
      }, (err) => {
        adminError('dashboard', 'users listener failed', err);
        setError(getReadableErrorMessageOr(err, 'Failed to load users'));
        setLoading(false);
      }),
      onSnapshot(collection(db, 'orders'), (snap) => {
        state.orders = snap.docs.map((doc) => doc.data());
        publish();
      }, (err) => {
        adminError('dashboard', 'orders listener failed', err);
        setError(getReadableErrorMessageOr(err, 'Failed to load orders'));
        setLoading(false);
      }),
      onSnapshot(collection(db, 'complaints'), (snap) => {
        state.complaints = snap.size;
        publish();
      }, (err) => {
        adminError('dashboard', 'complaints listener failed', err);
        setError(getReadableErrorMessageOr(err, 'Failed to load complaints'));
        setLoading(false);
      }),
      onSnapshot(collection(db, 'reports'), (snap) => {
        state.reports = snap.docs.map((doc) => doc.data());
        publish();
      }, (err) => {
        adminError('dashboard', 'reports listener failed', err);
        setError(getReadableErrorMessageOr(err, 'Failed to load reports'));
        setLoading(false);
      }),
    ];

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user, firestoreUserRole]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AdminHeader title="Admin Dashboard" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AdminHeader title="Admin Dashboard" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>HalfOrder Admin Dashboard</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {stats ? (
          <View style={styles.cards}>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.users as never)}
            >
              <Text style={styles.cardLabel}>Total Users</Text>
              <Text style={styles.cardValue}>{stats.totalUsers}</Text>
              <Text style={styles.cardCta}>Open list →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders() as never)}
            >
              <Text style={styles.cardLabel}>Total Orders</Text>
              <Text style={styles.cardValue}>{stats.totalOrders}</Text>
              <Text style={styles.cardCta}>Open list →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push(adminRoutes.orders({ filter: 'active' }) as never)
              }
            >
              <Text style={styles.cardLabel}>Active Orders</Text>
              <Text style={styles.cardValue}>{stats.activeOrders}</Text>
              <Text style={styles.cardCta}>Filtered view →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.reports as never)}
            >
              <Text style={styles.cardLabel}>Reports & moderation</Text>
              <Text style={styles.cardValue}>{stats.reports}</Text>
              <Text style={styles.cardSub}>
                Reported users: {stats.reportedUsers}
              </Text>
              <Text style={styles.cardCta}>Open reports →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders({ filter: 'pending' }) as never)}
            >
              <Text style={styles.cardLabel}>Pending payments</Text>
              <Text style={styles.cardValue}>{stats.pendingPayments}</Text>
              <Text style={styles.cardSub}>Live payment queue</Text>
              <Text style={styles.cardCta}>Open orders →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders({ filter: 'active' }) as never)}
            >
              <Text style={styles.cardLabel}>Active deliveries</Text>
              <Text style={styles.cardValue}>{stats.activeDeliveries}</Text>
              <Text style={styles.cardSub}>Driver assigned or in transit</Text>
              <Text style={styles.cardCta}>Filtered view →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(adminRoutes.orders({ filter: 'completed' }) as never)}
            >
              <Text style={styles.cardLabel}>Completed orders</Text>
              <Text style={styles.cardValue}>{stats.completedOrders}</Text>
              <Text style={styles.cardSub}>Delivered or completed</Text>
              <Text style={styles.cardCta}>Completed view →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() =>
                router.push(adminRoutes.orders({ filter: 'today' }) as never)
              }
            >
              <Text style={styles.cardLabel}>Orders Today</Text>
              <Text style={styles.cardValue}>{stats.ordersToday}</Text>
              <Text style={styles.cardCta}>Today only →</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  cards: {
    gap: 12,
  },
  card: {
    ...adminCardShell,
    padding: theme.spacing.section,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSub: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  cardCta: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unauthorized: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  backBtn: {
    marginTop: 8,
  },
  backBtnText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
  },
});
