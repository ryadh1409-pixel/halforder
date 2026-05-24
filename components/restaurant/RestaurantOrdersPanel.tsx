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

import OrderCard from '@/components/orders/OrderCard';
import { systemActionSheet, systemConfirm } from '@/components/SystemDialogHost';
import {
  RESTAURANT_ORDER_FILTERS,
  restaurantOrderFilterEmptyTitle,
  type RestaurantOrderListFilter,
} from '@/constants/restaurantOrderFilters';
import { useRestaurantOrders } from '@/hooks/useRestaurantOrders';
import type { OrderStatus } from '@/services/orderService';
import { rejectOrder, updateOrderStatus } from '@/services/orderService';
import { showError, showSuccess, showUndoToast } from '@/utils/toast';

type Props = {
  restaurantId: string;
  restaurantTimeZone?: string | null;
  onOpenOrder?: (orderId: string) => void;
  onAssignDriver?: (orderId: string) => void;
  title?: string;
};

export function RestaurantOrdersPanel({
  restaurantId,
  restaurantTimeZone,
  onOpenOrder,
  onAssignDriver,
  title = 'Orders',
}: Props) {
  const [filter, setFilter] = useState<RestaurantOrderListFilter>('active');
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);

  const {
    orders,
    loading,
    timeZone,
    archiveOrder,
    hideOrder,
    restoreOrder,
  } = useRestaurantOrders({
    restaurantId,
    restaurantTimeZone,
    filter,
    enableAutoCleanup: filter !== 'archived',
  });

  const emptyTitle = restaurantOrderFilterEmptyTitle(filter);

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

  const confirmRemoveFromDashboard = useCallback(
    async (orderId: string, mode: 'archive' | 'hide') => {
      const ok = await systemConfirm({
        title: 'Remove from dashboard?',
        message:
          'This order stays in your records but will no longer appear in the live list.',
        confirmLabel: mode === 'archive' ? 'Archive' : 'Hide',
        destructive: true,
      });
      if (!ok) return;

      const previousFilter = filter;
      try {
        if (mode === 'archive') {
          await archiveOrder(orderId);
        } else {
          await hideOrder(orderId);
        }
        showUndoToast('Order removed from dashboard', () => {
          void restoreOrder(orderId).then(() => {
            showSuccess('Order restored');
            setFilter(previousFilter);
          });
        });
      } catch {
        showError('Could not update order.');
      }
    },
    [archiveOrder, filter, hideOrder, restoreOrder],
  );

  const openOrderActions = useCallback(
    (orderId: string, isArchived: boolean) => {
      if (isArchived) {
        void systemActionSheet({
          title: 'Archived order',
          actions: [
            {
              label: 'Restore to dashboard',
              onPress: () => {
                void restoreOrder(orderId).then(() => showSuccess('Order restored'));
              },
            },
          ],
        });
        return;
      }

      void systemActionSheet({
        title: 'Order actions',
        actions: [
          {
            label: 'Archive',
            onPress: () => void confirmRemoveFromDashboard(orderId, 'archive'),
          },
          {
            label: 'Hide from dashboard',
            onPress: () => void confirmRemoveFromDashboard(orderId, 'hide'),
          },
        ],
      });
    },
    [confirmRemoveFromDashboard, restoreOrder],
  );

  const summary = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'pending').length;
    const preparing = orders.filter(
      (o) => o.status === 'preparing' || o.status === 'restaurant_accepted',
    ).length;
    const ready = orders.filter(
      (o) => o.status === 'ready' || o.status === 'ready_for_pickup',
    ).length;
    return { pending, preparing, ready };
  }, [orders]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {!loading ? (
          <Text style={styles.count}>{orders.length} shown</Text>
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
      ) : orders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={32} color="#94a3b8" />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptySub}>
            {filter === 'archived'
              ? 'Archived and hidden orders appear here.'
              : 'New orders show up instantly when customers place them.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {orders.map((order) => (
            <View key={order.id} style={styles.cardWrap}>
              <OrderCard
                order={order}
                timeZone={timeZone}
                onPress={() => onOpenOrder?.(order.id)}
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
              <Pressable
                style={styles.moreBtn}
                hitSlop={10}
                accessibilityLabel="Order actions"
                onPress={() =>
                  openOrderActions(
                    order.id,
                    filter === 'archived',
                  )
                }
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#64748b" />
              </Pressable>
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
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#334155', marginTop: 4 },
  emptySub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  list: { gap: 4 },
  cardWrap: { position: 'relative' },
  assignBtn: {
    marginTop: -4,
    marginBottom: 12,
    marginHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignBtnText: { color: '#334155', fontWeight: '800', fontSize: 14 },
  moreBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
});
