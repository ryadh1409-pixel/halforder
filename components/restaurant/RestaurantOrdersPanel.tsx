import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RestaurantArchiveOrderCard } from '@/components/restaurant/RestaurantArchiveOrderCard';
import { RestaurantLiveOrderCard } from '@/components/restaurant/RestaurantLiveOrderCard';
import {
  isRestaurantOrderCancelled,
  isRestaurantOrderDelivered,
  RESTAURANT_ACTIVE_ORDER_FILTERS,
  restaurantOrderFilterEmptyTitle,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import { useHostRestaurantOrdersUi } from '@/contexts/HostRestaurantOrdersContext';
import { useRestaurantOrdersLifecycleAlerts } from '@/hooks/useOrderLifecycleAlerts';
import { useRestaurantOrders } from '@/hooks/useRestaurantOrders';
import { clearOrderStageLock } from '@/lib/orderStageLock';
import {
  applyRestaurantKitchenAction,
  primeRestaurantKitchenOptimistic,
  type RestaurantKitchenAction,
} from '@/lib/restaurantKitchenActions';
import {
  computeRestaurantDashboardMetrics,
  isOrderFresh,
} from '@/lib/restaurantOrderFreshness';
import {
  consumePendingRestaurantOrderFocus,
  subscribeRestaurantOrderFocus,
} from '@/lib/restaurantOrderFocus';
import { ROLE_ORDER_UPDATE_ERROR, showUserError } from '@/services/errors';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { deriveOrderStage, getRestaurantOrderPresentation } from '@/services/orderStage';
import { showError, showSuccess } from '@/utils/toast';

export type RestaurantDashboardMetrics = {
  ordersToday: number;
  revenue: number;
};

type OrdersMode = 'active' | 'history';
type ArchiveStatusFilter = 'all' | 'completed' | 'cancelled';
type ArchiveDateFilter = 'all' | 'today' | '7d' | '30d';

type Props = {
  restaurantId: string;
  restaurantTimeZone?: string | null;
  onAssignDriver?: (orderId: string) => void;
  title?: string;
  onDashboardMetrics?: (metrics: RestaurantDashboardMetrics) => void;
};

const EMPTY_ACTIVE = 'New orders appear here instantly — no refresh needed.';
const EMPTY_HISTORY = 'Completed and cancelled orders are archived here automatically.';

function kitchenActionFromStatus(status: OrderStatus): RestaurantKitchenAction | null {
  if (status === 'accepted') return 'accept';
  if (status === 'preparing') return 'preparing';
  if (status === 'ready' || status === 'ready_for_pickup') return 'ready';
  return null;
}

function matchesArchivedSearch(order: RestaurantOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    order.id,
    order.customerName,
    order.customer?.name,
    order.driverName,
    order.driver?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function matchesArchiveDate(order: RestaurantOrder, filter: ArchiveDateFilter): boolean {
  if (filter === 'all') return true;
  const created = order.createdAtMs ?? 0;
  if (!created) return false;
  const now = Date.now();
  if (filter === 'today') return created >= startOfLocalDay(now);
  if (filter === '7d') return created >= now - 7 * 24 * 60 * 60 * 1000;
  if (filter === '30d') return created >= now - 30 * 24 * 60 * 60 * 1000;
  return true;
}

function matchesArchiveStatus(order: RestaurantOrder, filter: ArchiveStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') {
    return isRestaurantOrderDelivered(order) && !isRestaurantOrderCancelled(order);
  }
  return isRestaurantOrderCancelled(order);
}

export function RestaurantOrdersPanel({
  restaurantId,
  restaurantTimeZone,
  onAssignDriver,
  title = 'Orders',
  onDashboardMetrics,
}: Props) {
  const sharedUi = useHostRestaurantOrdersUi();
  const [localMode, setLocalMode] = useState<OrdersMode>('active');
  const [localFilter, setLocalFilter] = useState<RestaurantOrderListFilter>('new');
  const mode = sharedUi?.mode ?? localMode;
  const filter = sharedUi?.filter ?? localFilter;
  const setMode = sharedUi?.setMode ?? setLocalMode;
  const setFilter = sharedUi?.setFilter ?? setLocalFilter;
  const [archivedSearch, setArchivedSearch] = useState('');
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatusFilter>('all');
  const [archiveDate, setArchiveDate] = useState<ArchiveDateFilter>('all');
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<{
    orderId: string;
    action: RestaurantKitchenAction;
  } | null>(null);

  const listFilter: RestaurantOrderListFilter = mode === 'history' ? 'archived' : filter;

  const {
    orders,
    allOrders,
    loading,
    timeZone,
    applyKitchenOptimistic,
    clearKitchenOptimistic,
  } = useRestaurantOrders({
    restaurantId,
    restaurantTimeZone,
    filter: listFilter,
    enableAutoCleanup: false,
  });

  useRestaurantOrdersLifecycleAlerts(allOrders);

  const applyFocusOrder = useCallback((orderId: string) => {
    const id = orderId.trim();
    if (!id) return;
    setMode('active');
    setFilter('new');
    setHighlightOrderId(id);
    const timer = setTimeout(() => {
      setHighlightOrderId((current) => (current === id ? null : current));
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    const pending = consumePendingRestaurantOrderFocus();
    let clearHighlight: (() => void) | undefined;
    if (pending) {
      clearHighlight = applyFocusOrder(pending);
    }
    const unsub = subscribeRestaurantOrderFocus((orderId) => {
      clearHighlight?.();
      clearHighlight = applyFocusOrder(orderId);
    });
    return () => {
      unsub();
      clearHighlight?.();
    };
  }, [applyFocusOrder]);

  const seenOrderIdsRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (loading) return;
    const ids = allOrders.map((order) => order.id).filter(Boolean);
    if (!seenOrderIdsRef.current) {
      seenOrderIdsRef.current = new Set(ids);
      return;
    }
    for (const order of allOrders) {
      const id = order.id?.trim();
      if (!id || seenOrderIdsRef.current.has(id)) continue;
      seenOrderIdsRef.current.add(id);
      if (deriveOrderStage(order) === 'awaiting_restaurant') {
        applyFocusOrder(id);
      }
    }
  }, [allOrders, applyFocusOrder, loading]);

  const archivedFiltered = useMemo(() => {
    if (mode !== 'history') return [];
    return orders.filter(
      (order) =>
        matchesArchivedSearch(order, archivedSearch) &&
        matchesArchiveStatus(order, archiveStatus) &&
        matchesArchiveDate(order, archiveDate),
    );
  }, [archiveDate, archiveStatus, archivedSearch, mode, orders]);

  const activeOrders = useMemo(() => {
    if (mode !== 'active') return [];
    return orders.filter((order) => isOrderFresh(order));
  }, [mode, orders]);

  const archivedRevenue = useMemo(() => {
    return archivedFiltered.reduce(
      (sum, order) =>
        sum + (isRestaurantOrderDelivered(order) && !isRestaurantOrderCancelled(order)
          ? order.totalPrice
          : 0),
      0,
    );
  }, [archivedFiltered]);

  React.useEffect(() => {
    if (!onDashboardMetrics) return;
    const m = computeRestaurantDashboardMetrics(allOrders);
    onDashboardMetrics({ ordersToday: m.total, revenue: m.revenue });
  }, [allOrders, onDashboardMetrics]);

  const emptyTitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return 'No orders yet';
    if (mode === 'history') return 'No matching archive orders';
    return restaurantOrderFilterEmptyTitle(filter);
  }, [allOrders.length, filter, loading, mode]);

  const emptySubtitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return EMPTY_ACTIVE;
    return mode === 'history' ? EMPTY_HISTORY : EMPTY_ACTIVE;
  }, [allOrders.length, loading, mode]);

  const handleKitchenAction = useCallback(
    async (order: RestaurantOrder, status: OrderStatus) => {
      const action = kitchenActionFromStatus(status);
      if (!action) return;
      if (actionInFlight) return;

      const optimisticPatch = primeRestaurantKitchenOptimistic(order.id, action);
      applyKitchenOptimistic(order.id, optimisticPatch);
      setActionInFlight({ orderId: order.id, action });

      try {
        const result = await applyRestaurantKitchenAction(order.id, action, order);
        if (result === 'skipped_illegal') {
          clearKitchenOptimistic(order.id);
          clearOrderStageLock(order.id);
          showError('This action is not available for the current order state.');
          return;
        }
        showSuccess('Order updated');
      } catch {
        clearKitchenOptimistic(order.id);
        clearOrderStageLock(order.id);
        showUserError(new Error('order_update_failed'), {
          role: 'restaurant',
          context: 'restaurant',
          fallback: ROLE_ORDER_UPDATE_ERROR.restaurant,
        });
      } finally {
        setActionInFlight(null);
      }
    },
    [actionInFlight, applyKitchenOptimistic, clearKitchenOptimistic],
  );

  const [rejectOrderId, setRejectOrderId] = React.useState<string | null>(null);

  const handleReject = useCallback(
    async (orderId: string) => {
      if (actionInFlight || rejectOrderId) return;
      setRejectOrderId(orderId);
      try {
        const { rejectOrder } = await import('@/services/orderService');
        await rejectOrder(orderId);
        clearOrderStageLock(orderId);
        clearKitchenOptimistic(orderId);
        showSuccess('Order rejected');
      } catch {
        showUserError(new Error('order_reject_failed'), {
          role: 'restaurant',
          context: 'restaurant',
          fallback: ROLE_ORDER_UPDATE_ERROR.restaurant,
        });
      } finally {
        setRejectOrderId(null);
      }
    },
    [actionInFlight, clearKitchenOptimistic, rejectOrderId],
  );

  const summary = useMemo(() => {
    let pending = 0;
    let preparing = 0;
    let ready = 0;
    let withDriver = 0;
    let completed = 0;
    let cancelled = 0;
    for (const o of allOrders) {
      if (isRestaurantOrderCancelled(o)) {
        cancelled += 1;
        continue;
      }
      if (isRestaurantOrderDelivered(o)) {
        completed += 1;
        continue;
      }
      if (!isOrderFresh(o)) continue;
      const stage = deriveOrderStage(o);
      if (stage === 'awaiting_restaurant') pending += 1;
      else if (stage === 'preparing') preparing += 1;
      else if (stage === 'driver_assignment') ready += 1;
      else if (stage === 'driver_assigned' || stage === 'picked_up') withDriver += 1;
    }
    return { pending, preparing, ready, withDriver, completed, cancelled };
  }, [allOrders]);

  const listOrders = useMemo(() => {
    const base = mode === 'history' ? archivedFiltered : activeOrders;
    if (!highlightOrderId || mode !== 'active') return base;
    const focused = base.filter((order) => order.id === highlightOrderId);
    const rest = base.filter((order) => order.id !== highlightOrderId);
    return focused.length ? [...focused, ...rest] : base;
  }, [activeOrders, archivedFiltered, highlightOrderId, mode]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {!loading ? <Text style={styles.count}>{listOrders.length} shown</Text> : null}
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeTab, mode === 'active' && styles.modeTabActive]}
          onPress={() => setMode('active')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'active' }}
        >
          <Text style={[styles.modeTabText, mode === 'active' && styles.modeTabTextActive]}>
            Active Orders
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeTab, mode === 'history' && styles.modeTabActive]}
          onPress={() => setMode('history')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === 'history' }}
        >
          <Text style={[styles.modeTabText, mode === 'history' && styles.modeTabTextActive]}>
            Order History
          </Text>
        </Pressable>
      </View>

      {mode === 'active' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {RESTAURANT_ACTIVE_ORDER_FILTERS.map((chip) => {
            const active = chip.id === filter;
            const count =
              chip.id === 'new'
                ? summary.pending
                : chip.id === 'preparing'
                  ? summary.preparing
                  : chip.id === 'ready'
                    ? summary.ready
                    : summary.withDriver;
            return (
              <Pressable
                key={chip.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(chip.id)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label}
                  {count > 0 ? ` · ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.archiveTools}>
          <Text style={styles.archiveLabel}>Archive</Text>
          <Text style={styles.archiveHint}>
            Completed and cancelled orders move here automatically.
          </Text>
          <TextInput
            value={archivedSearch}
            onChangeText={setArchivedSearch}
            placeholder="Search order, customer, driver…"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                { id: 'all', label: 'All status' },
                { id: 'completed', label: 'Completed' },
                { id: 'cancelled', label: 'Cancelled' },
              ] as const
            ).map((chip) => {
              const active = archiveStatus === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setArchiveStatus(chip.id)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {(
              [
                { id: 'all', label: 'Any date' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 days' },
                { id: '30d', label: 'Last 30 days' },
              ] as const
            ).map((chip) => {
              const active = archiveDate === chip.id;
              return (
                <Pressable
                  key={chip.id}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setArchiveDate(chip.id)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.revenueLine}>
            Completed revenue in view: ${archivedRevenue.toFixed(2)}
          </Text>
        </View>
      )}

      {!loading && mode === 'active' ? (
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.pending}</Text>
            <Text style={styles.summaryLabel}>New</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.preparing}</Text>
            <Text style={styles.summaryLabel}>Preparing</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.ready}</Text>
            <Text style={styles.summaryLabel}>Ready</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.withDriver}</Text>
            <Text style={styles.summaryLabel}>With driver</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#A855F7" />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      ) : listOrders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color="#94A3B8" />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>{emptySubtitle}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {listOrders.map((order) => (
            <View key={order.id} style={styles.cardWrap}>
              {mode === 'history' ? (
                <RestaurantArchiveOrderCard order={order} timeZone={timeZone} />
              ) : (
                <>
                  <RestaurantLiveOrderCard
                    order={order}
                    timeZone={timeZone}
                    sourceScreen="RestaurantOrdersPanel"
                    highlighted={highlightOrderId === order.id}
                    pendingAction={
                      actionInFlight?.orderId === order.id ? actionInFlight.action : null
                    }
                    onStatus={(status) => void handleKitchenAction(order, status)}
                    onReject={() => void handleReject(order.id)}
                    loading={
                      actionInFlight?.orderId === order.id || rejectOrderId === order.id
                    }
                  />
                  {onAssignDriver &&
                  getRestaurantOrderPresentation(order).canAssignDriver ? (
                    <Pressable
                      style={styles.assignBtn}
                      onPress={() => onAssignDriver(order.id)}
                    >
                      <Text style={styles.assignBtnText}>Assign driver</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  count: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  modeTabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  modeTabTextActive: { color: '#0F172A' },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  filterChipActive: {
    backgroundColor: '#A855F7',
    borderColor: '#A855F7',
  },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  summaryLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: '#64748B' },
  archiveTools: { gap: 8 },
  archiveLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  archiveHint: { fontSize: 13, fontWeight: '500', color: '#64748B', lineHeight: 18 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontWeight: '600',
  },
  revenueLine: { fontSize: 13, fontWeight: '700', color: '#A855F7' },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: { color: '#64748B', fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginTop: 6 },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  list: { gap: 4 },
  cardWrap: { position: 'relative' },
  assignBtn: {
    marginTop: -4,
    marginBottom: 12,
    marginHorizontal: 4,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnText: { color: '#334155', fontWeight: '800', fontSize: 14 },
});
