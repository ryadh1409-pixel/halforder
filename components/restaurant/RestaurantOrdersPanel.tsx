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

import { RestaurantDeliveredOrderCard } from '@/components/restaurant/RestaurantDeliveredOrderCard';
import { RestaurantLiveOrderCard } from '@/components/restaurant/RestaurantLiveOrderCard';
import {
  isRestaurantOrderDelivered,
  RESTAURANT_ORDER_FILTERS,
  restaurantOrderFilterEmptyTitle,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import {
  computeRestaurantDashboardMetrics,
  isOrderFresh,
} from '@/lib/restaurantOrderFreshness';
import {
  applyRestaurantKitchenAction,
  primeRestaurantKitchenOptimistic,
  type RestaurantKitchenAction,
} from '@/lib/restaurantKitchenActions';
import { clearOrderStageLock } from '@/lib/orderStageLock';
import { useRestaurantOrders } from '@/hooks/useRestaurantOrders';
import { useRestaurantOrdersLifecycleAlerts } from '@/hooks/useOrderLifecycleAlerts';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { deriveOrderStage, getRestaurantOrderPresentation } from '@/services/orderStage';
import { ROLE_ORDER_UPDATE_ERROR, showUserError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';

export type RestaurantDashboardMetrics = {
  ordersToday: number;
  revenue: number;
};

type Props = {
  restaurantId: string;
  restaurantTimeZone?: string | null;
  onAssignDriver?: (orderId: string) => void;
  title?: string;
  onDashboardMetrics?: (metrics: RestaurantDashboardMetrics) => void;
};

const EMPTY_SUBTITLE =
  'Orders placed within the last 24 hours will appear here instantly.';

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

export function RestaurantOrdersPanel({
  restaurantId,
  restaurantTimeZone,
  onAssignDriver,
  title = 'Live orders',
  onDashboardMetrics,
}: Props) {
  const [filter, setFilter] = useState<RestaurantOrderListFilter>('new');
  const [archivedSearch, setArchivedSearch] = useState('');
  const [actionInFlight, setActionInFlight] = useState<{
    orderId: string;
    action: RestaurantKitchenAction;
  } | null>(null);

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
    filter,
    enableAutoCleanup: false,
  });

  useRestaurantOrdersLifecycleAlerts(allOrders);

  const freshOrders = useMemo(
    () => (filter === 'archived' ? orders : orders.filter((order) => isOrderFresh(order))),
    [filter, orders],
  );

  const archivedFiltered = useMemo(() => {
    if (filter !== 'archived') return freshOrders;
    return orders.filter((order) => matchesArchivedSearch(order, archivedSearch));
  }, [archivedSearch, filter, freshOrders, orders]);

  const archivedRevenue = useMemo(() => {
    if (filter !== 'archived') return 0;
    return archivedFiltered.reduce(
      (sum, order) => sum + (isRestaurantOrderDelivered(order) ? order.totalPrice : 0),
      0,
    );
  }, [archivedFiltered, filter]);

  React.useEffect(() => {
    if (!onDashboardMetrics) return;
    const m = computeRestaurantDashboardMetrics(allOrders);
    onDashboardMetrics({ ordersToday: m.total, revenue: m.revenue });
  }, [allOrders, onDashboardMetrics]);

  const emptyTitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return 'No orders yet';
    return restaurantOrderFilterEmptyTitle(filter);
  }, [allOrders.length, filter, loading]);

  const emptySubtitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return EMPTY_SUBTITLE;
    if (filter === 'archived') {
      return 'Historical orders older than 24h or manually archived.';
    }
    return EMPTY_SUBTITLE;
  }, [allOrders.length, filter, loading]);

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
    for (const o of allOrders.filter(isOrderFresh)) {
      const stage = deriveOrderStage(o);
      if (stage === 'awaiting_restaurant') pending += 1;
      else if (stage === 'preparing') preparing += 1;
      else if (stage === 'driver_assignment') ready += 1;
      else if (stage === 'driver_assigned' || stage === 'picked_up') withDriver += 1;
    }
    return { pending, preparing, ready, withDriver };
  }, [allOrders]);

  const listOrders = filter === 'archived' ? archivedFiltered : freshOrders;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {!loading ? <Text style={styles.count}>{listOrders.length} shown</Text> : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {RESTAURANT_ORDER_FILTERS.map((chip) => {
          const active = chip.id === filter;
          return (
            <Pressable
              key={chip.id}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(chip.id)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!loading ? (
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

      {filter === 'archived' ? (
        <View style={styles.archivedTools}>
          <TextInput
            value={archivedSearch}
            onChangeText={setArchivedSearch}
            placeholder="Search order, customer, driver…"
            placeholderTextColor="#7D8493"
            style={styles.searchInput}
          />
          <Text style={styles.revenueLine}>
            Delivered revenue in view: ${archivedRevenue.toFixed(2)}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#16a34a" />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      ) : listOrders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color="#7D8493" />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>{emptySubtitle}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {listOrders.map((order) => (
            <View key={order.id} style={styles.cardWrap}>
              {filter === 'delivered' ? (
                <RestaurantDeliveredOrderCard order={order} timeZone={timeZone} />
              ) : (
                <>
                  <RestaurantLiveOrderCard
                    order={order}
                    timeZone={timeZone}
                    sourceScreen="RestaurantOrdersPanel"
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
  title: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  count: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B7BDC9',
  },
  filterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#B7BDC9' },
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
    borderColor: '#B7BDC9',
  },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  summaryLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: '#64748b' },
  archivedTools: { gap: 8 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#000000',
    color: '#FFFFFF',
    fontWeight: '600',
  },
  revenueLine: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: { color: '#64748b', fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B7BDC9',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#B7BDC9', marginTop: 6 },
  emptySub: {
    fontSize: 14,
    color: '#64748b',
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
    borderColor: '#cbd5e1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnText: { color: '#B7BDC9', fontWeight: '800', fontSize: 14 },
});
