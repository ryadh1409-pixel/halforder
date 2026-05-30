import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RestaurantLiveOrderCard } from '@/components/restaurant/RestaurantLiveOrderCard';
import {
  RESTAURANT_ORDER_FILTERS,
  restaurantOrderFilterEmptyTitle,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { useRestaurantOrders } from '@/hooks/useRestaurantOrders';
import type { OrderStatus } from '@/services/orderService';
import { rejectOrder, updateOrderStatus } from '@/services/orderService';
import { showError, showSuccess } from '@/utils/toast';

type Props = {
  restaurantId: string;
  restaurantTimeZone?: string | null;
  onAssignDriver?: (orderId: string) => void;
  title?: string;
};

const EMPTY_TITLE = 'No active orders';
const EMPTY_SUBTITLE =
  'Orders placed within the last 24 hours will appear here instantly.';

export function RestaurantOrdersPanel({
  restaurantId,
  restaurantTimeZone,
  onAssignDriver,
  title = 'Live orders',
}: Props) {
  const [filter, setFilter] = useState<RestaurantOrderListFilter>('active');
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);

  const { orders, allOrders, loading, timeZone } = useRestaurantOrders({
    restaurantId,
    restaurantTimeZone,
    filter,
    enableAutoCleanup: false,
  });

  const freshOrders = useMemo(
    () => orders.filter((order) => isOrderFresh(order)),
    [orders],
  );

  const emptyTitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return EMPTY_TITLE;
    if (!loading && freshOrders.length === 0) {
      return restaurantOrderFilterEmptyTitle(filter);
    }
    return restaurantOrderFilterEmptyTitle(filter);
  }, [allOrders.length, filter, freshOrders.length, loading]);

  const emptySubtitle = useMemo(() => {
    if (!loading && allOrders.length === 0) return EMPTY_SUBTITLE;
    if (filter === 'archived') {
      return 'Archived and hidden orders from the last 24 hours appear here.';
    }
    return EMPTY_SUBTITLE;
  }, [allOrders.length, filter, loading]);

  const handleStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    setActionOrderId(orderId);
    try {
      await updateOrderStatus(orderId, status);
      showSuccess('Order updated');
    } catch {
      showError('Unable to update order.');
    } finally {
      setActionOrderId(null);
    }
  }, []);

  const handleReject = useCallback(async (orderId: string) => {
    setActionOrderId(orderId);
    try {
      await rejectOrder(orderId);
      showSuccess('Order rejected');
    } catch {
      showError('Could not reject order.');
    } finally {
      setActionOrderId(null);
    }
  }, []);

  const summary = useMemo(() => {
    const pending = freshOrders.filter(
      (o) =>
        o.status === 'pending' ||
        o.status === 'payment_confirmed' ||
        o.status === 'pending_driver',
    ).length;
    const preparing = freshOrders.filter(
      (o) => o.status === 'preparing' || o.status === 'restaurant_accepted',
    ).length;
    const ready = freshOrders.filter(
      (o) => o.status === 'ready' || o.status === 'ready_for_pickup',
    ).length;
    return { pending, preparing, ready };
  }, [freshOrders]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {!loading ? (
          <Text style={styles.count}>{freshOrders.length} shown</Text>
        ) : null}
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

      {filter === 'active' && !loading ? (
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.pending}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.preparing}</Text>
            <Text style={styles.summaryLabel}>Preparing</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{summary.ready}</Text>
            <Text style={styles.summaryLabel}>Ready</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#16a34a" />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      ) : freshOrders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color="#94a3b8" />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>{emptySubtitle}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {freshOrders.map((order) => (
            <View key={order.id} style={styles.cardWrap}>
              <RestaurantLiveOrderCard
                order={order}
                timeZone={timeZone}
                onStatus={(status) => void handleStatus(order.id, status)}
                onReject={() => void handleReject(order.id)}
                loading={actionOrderId === order.id}
              />
              {onAssignDriver &&
              (order.status === 'ready_for_pickup' || order.status === 'ready') ? (
                <Pressable
                  style={styles.assignBtn}
                  onPress={() => onAssignDriver(order.id)}
                >
                  <Text style={styles.assignBtnText}>Assign driver</Text>
                </Pressable>
              ) : null}
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
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  count: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#fff' },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  summaryLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#64748b' },
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
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#334155', marginTop: 6 },
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
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnText: { color: '#334155', fontWeight: '800', fontSize: 14 },
});
