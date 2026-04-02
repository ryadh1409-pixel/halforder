import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type OrderRow = {
  id: string;
  restaurantName: string;
  creatorEmail: string;
  creatorId: string;
  createdAt: string;
  createdMs: number;
  status: string;
  participants: number;
};

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminOrdersScreen() {
  const router = useRouter();
  const { filter: filterRaw } = useLocalSearchParams<{ filter?: string }>();
  const filter =
    typeof filterRaw === 'string'
      ? filterRaw
      : Array.isArray(filterRaw)
        ? filterRaw[0]
        : 'all';
  const effectiveFilter =
    !filter || filter === '' ? 'all' : filter;

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAdminUser(user);

  const fetchOrders = useCallback(async () => {
    try {
      const [ordersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'users')),
      ]);

      const emailByUid: Record<string, string> = {};
      usersSnap.docs.forEach((d) => {
        const email = d.data()?.email;
        if (typeof email === 'string') emailByUid[d.id] = email;
      });

      const list: OrderRow[] = [];
      ordersSnap.docs.forEach((d) => {
        const data = d.data();
        const creatorId = (data?.createdBy ??
          data?.hostId ??
          data?.creatorId ??
          data?.userId ??
          '') as string;
        const createdAt = data?.createdAt;
        const ms =
          typeof createdAt?.toMillis === 'function'
            ? createdAt.toMillis()
            : typeof createdAt?.seconds === 'number'
              ? createdAt.seconds * 1000
              : 0;
        const rawList = data?.participants;
        const participantsList = Array.isArray(rawList)
          ? rawList.filter((x): x is string => typeof x === 'string')
          : [];
        list.push({
          id: d.id,
          restaurantName:
            typeof data?.restaurantName === 'string'
              ? data.restaurantName
              : typeof data?.foodName === 'string'
                ? data.foodName
                : '—',
          creatorEmail: (emailByUid[creatorId] ?? creatorId) || '—',
          creatorId: typeof creatorId === 'string' ? creatorId : '',
          createdAt: ms ? new Date(ms).toLocaleString() : '—',
          createdMs: ms,
          status: typeof data?.status === 'string' ? data.status : '—',
          participants: participantsList.length,
        });
      });
      list.sort((a, b) => b.createdMs - a.createdMs);
      setOrders(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const todayStart = startOfTodayMs();
    if (effectiveFilter === 'today') {
      return orders.filter((o) => o.createdMs >= todayStart);
    }
    if (effectiveFilter === 'active') {
      return orders.filter((o) =>
        ['open', 'active', 'matched', 'full', 'locked', 'ready_to_pay'].includes(
          o.status,
        ),
      );
    }
    if (effectiveFilter === 'completed') {
      return orders.filter((o) => o.status === 'completed');
    }
    return orders;
  }, [orders, effectiveFilter]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin, fetchOrders]);

  useEffect(() => {
    if (!user) return;
    if (!isAdminUser(user)) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Sign in to continue.</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.link}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.accessDenied}>Access denied</Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.link}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filterLabel =
    effectiveFilter === 'today'
      ? 'Today'
      : effectiveFilter === 'active'
        ? 'Active'
        : effectiveFilter === 'completed'
          ? 'Completed'
          : 'All';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchOrders();
            }}
            tintColor={COLORS.primary}
          />
        }
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.link}>← Dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Orders ({filterLabel})</Text>
        <View style={styles.chipRow}>
          {(
            [
              ['all', 'All'],
              ['today', 'Today'],
              ['active', 'Active'],
              ['completed', 'Done'],
            ] as const
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.chip,
                (effectiveFilter === key ||
                  (key === 'all' && effectiveFilter === 'all')) &&
                  styles.chipActive,
              ]}
              onPress={() => {
                if (key === 'all') router.replace('/admin-orders' as never);
                else
                  router.replace(
                    `/admin-orders?filter=${encodeURIComponent(key)}` as never,
                  );
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  (effectiveFilter === key ||
                    (key === 'all' && effectiveFilter === 'all')) &&
                    styles.chipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {filtered.map((o) => (
          <TouchableOpacity
            key={o.id}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/admin-order/${o.id}` as never)}
          >
            <Text style={styles.rowLabel}>Restaurant</Text>
            <Text style={styles.rowValue}>{o.restaurantName}</Text>
            <Text style={styles.rowLabel}>Creator</Text>
            <Text style={styles.rowValue}>{o.creatorEmail}</Text>
            <Text style={styles.rowLabel}>Created</Text>
            <Text style={styles.rowValue}>{o.createdAt}</Text>
            <Text style={styles.rowLabel}>Status</Text>
            <Text style={styles.rowValue}>{o.status}</Text>
            <Text style={styles.rowLabel}>Participants</Text>
            <Text style={styles.rowValue}>{o.participants}</Text>
            <Text style={styles.tapHint}>Tap for details & actions →</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  backBtn: { marginBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  chipTextActive: { color: COLORS.onPrimary },
  accessDenied: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: { color: COLORS.error, fontSize: 14 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  rowLabel: { fontSize: 13, color: COLORS.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 16, color: COLORS.text, marginBottom: 12 },
  tapHint: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 4,
  },
});
