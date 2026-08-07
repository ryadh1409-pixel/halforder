/**
 * Admin: Emo AI Orders — list view.
 *
 * Displays ONLY orders created via Emo AI → "I Want Something" (orderSource === 'emo_concierge').
 * Completely isolated from Food Share and Pick Up order tables.
 */

import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  subscribeEmoOrders,
  computeEmoOrderAnalytics,
  sortEmoOrders,
  filterEmoOrders,
  formatEmoOrderStatus,
  emoOrderStatusColor,
  formatEmoTs,
  type AdminEmoOrder,
  type AdminEmoOrderAnalytics,
  type EmoOrderSortKey,
} from '@/services/adminEmoOrdersService';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics bar
// ─────────────────────────────────────────────────────────────────────────────

type AnalyticsStatProps = {
  label: string;
  value: number;
  color?: string;
};

function AnalyticsStat({ label, value, color }: AnalyticsStatProps) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AnalyticsBar({ analytics }: { analytics: AdminEmoOrderAnalytics }) {
  return (
    <View style={styles.analyticsBar}>
      <AnalyticsStat label="Active" value={analytics.activeOrders} color={COLORS.primary} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Today" value={analytics.completedToday} color={COLORS.accentGreen} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Unpaid" value={analytics.pendingPayments} color={COLORS.accentAmber} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Searching" value={analytics.searchingDriver} color={COLORS.accentBlue} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Delivering" value={analytics.delivering} color={COLORS.primary} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Done" value={analytics.completed} color={COLORS.accentGreen} />
      <View style={styles.statDivider} />
      <AnalyticsStat label="Cancelled" value={analytics.cancelled} color={COLORS.error} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort / filter controls
// ─────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: EmoOrderSortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'status', label: 'Status' },
  { key: 'payment', label: 'Payment' },
  { key: 'restaurant', label: 'Restaurant' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_payment', label: 'Unpaid' },
  { key: 'payment_confirmed', label: 'Confirmed' },
  { key: 'searching_driver', label: 'Searching' },
  { key: 'driver_assigned', label: 'Assigned' },
  { key: 'picking_up', label: 'Picking Up' },
  { key: 'on_the_way', label: 'On Way' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Order row
// ─────────────────────────────────────────────────────────────────────────────

function OrderRow({
  order,
  onPress,
}: {
  order: AdminEmoOrder;
  onPress: () => void;
}) {
  const statusColor = emoOrderStatusColor(order.status, {
    accentGreen: COLORS.accentGreen,
    accentAmber: COLORS.accentAmber,
    accentRed: COLORS.error,
    primary: COLORS.primary,
    meta: COLORS.textMuted,
  });

  const isPaid =
    order.paymentStatus === 'paid' || order.paymentStatus === 'succeeded';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      {/* Left: customer + restaurant */}
      <View style={styles.rowLeft}>
        <Text style={styles.rowOrderId} numberOfLines={1}>
          #{order.id.slice(-8).toUpperCase()}
        </Text>
        <Text style={styles.rowCustomer} numberOfLines={1}>
          {order.customerName ?? order.customerId.slice(0, 12) ?? '—'}
        </Text>
        <Text style={styles.rowRestaurant} numberOfLines={1}>
          {order.restaurantName}
        </Text>
        <Text style={styles.rowMeal} numberOfLines={1}>
          {order.mealName}
        </Text>
      </View>

      {/* Right: status + financial + time */}
      <View style={styles.rowRight}>
        <Text style={[styles.rowStatus, { color: statusColor }]}>
          {formatEmoOrderStatus(order.status)}
        </Text>
        <Text style={[styles.rowPayment, { color: isPaid ? COLORS.accentGreen : COLORS.accentAmber }]}>
          {isPaid ? '✓ Paid' : '⏳ Unpaid'}
        </Text>
        <Text style={styles.rowTotal}>${order.total.toFixed(2)}</Text>
        <Text style={styles.rowTime}>{formatEmoTs(order.createdAtMs)}</Text>
        {order.city ? (
          <Text style={styles.rowCity}>{order.city}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminEmoOrdersScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();

  const [orders, setOrders] = useState<AdminEmoOrder[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<EmoOrderSortKey>('newest');
  const [statusFilter, setStatusFilter] = useState('all');

  const isAdmin = isAdminUser(user, firestoreUserRole);

  // Admin guard
  useEffect(() => {
    if (!isAdmin) {
      router.replace(adminRoutes.home as never);
    }
  }, [isAdmin, router]);

  // Firestore subscription
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeEmoOrders(
      (data) => {
        setOrders(data);
        setReady(true);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setReady(true);
      },
    );
    return () => unsub();
  }, [isAdmin]);

  const analytics = useMemo(() => computeEmoOrderAnalytics(orders), [orders]);

  const displayed = useMemo(() => {
    const filtered = filterEmoOrders(orders, {
      search,
      status: statusFilter,
    });
    return sortEmoOrders(filtered, sort);
  }, [orders, search, statusFilter, sort]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AdminHeader title="Emo AI Orders" onBack={() => router.back()} />
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Emo AI Orders" onBack={() => router.back()} />

      {/* ── Analytics bar ── */}
      <View style={styles.analyticsWrap}>
        <AnalyticsBar analytics={analytics} />
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customer, restaurant, driver, order ID…"
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      </View>

      {/* ── Status filter chips ── */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={STATUS_FILTERS}
        keyExtractor={(item) => item.key}
        style={styles.chipList}
        contentContainerStyle={styles.chipListContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, statusFilter === item.key && styles.chipActive]}
            onPress={() => setStatusFilter(item.key)}
          >
            <Text
              style={[styles.chipText, statusFilter === item.key && styles.chipTextActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* ── Sort chips ── */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={SORT_OPTIONS}
        keyExtractor={(item) => item.key}
        style={styles.chipList}
        contentContainerStyle={styles.chipListContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, sort === item.key && styles.chipActiveSort]}
            onPress={() => setSort(item.key)}
          >
            <Text
              style={[styles.chipText, sort === item.key && styles.chipTextActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      {/* ── Order list ── */}
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {search || statusFilter !== 'all'
                ? 'No orders match your filters.'
                : 'No Emo AI orders yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            onPress={() =>
              router.push(adminRoutes.emoOrder(item.id) as never)
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },

  // Analytics
  analyticsWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    ...adminCardShell,
    padding: 12,
  },
  analyticsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  // Search
  searchWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 0,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },

  // Filter chips
  chipList: { maxHeight: 40, marginTop: 8 },
  chipListContent: { paddingHorizontal: 14, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipActiveSort: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#FFF' },

  // Order list
  listContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40 },
  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: 2 },

  // Row
  row: {
    ...adminCardShell,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginVertical: 4,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  rowOrderId: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  rowCustomer: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowRestaurant: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  rowMeal: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted, marginTop: 2 },
  rowStatus: { fontSize: 12, fontWeight: '700' },
  rowPayment: { fontSize: 11, fontWeight: '700' },
  rowTotal: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  rowTime: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted },
  rowCity: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },

  // States
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
  errorText: { color: COLORS.error, fontSize: 13, textAlign: 'center', margin: 12 },
});
