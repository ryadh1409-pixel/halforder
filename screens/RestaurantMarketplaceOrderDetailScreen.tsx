import AppHeader from '@/components/AppHeader';
import OrderActions from '@/components/orders/OrderActions';
import OrderItems from '@/components/orders/OrderItems';
import OrderTimeline from '@/components/orders/OrderTimeline';
import PaymentSummary from '@/components/orders/PaymentSummary';
import { PaymentBadge } from '@/components/orders/StatusBadge';
import { merchantStatusFromOrder } from '@/components/orders/statusFlow';
import {
  applyRestaurantKitchenAction,
  primeRestaurantKitchenOptimistic,
  type RestaurantKitchenAction,
} from '@/lib/restaurantKitchenActions';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { applyStageLockToOrder, clearOrderStageLock } from '@/lib/orderStageLock';
import { useRestaurantOrderLifecycleAlert } from '@/hooks/useOrderLifecycleAlerts';
import { db } from '@/services/firebase';
import { rejectOrder, subscribeOrderById, type RestaurantOrder } from '@/services/orderService';
import { getRestaurantOrderPresentation, logOrderStage } from '@/services/orderStage';
import { ROLE_ORDER_UPDATE_ERROR, showUserError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Host-scoped restaurant marketplace order detail (`/(host)/orders/[id]`). */
export default function RestaurantMarketplaceOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [saving, setSaving] = useState<RestaurantKitchenAction | null>(null);
  const [kitchenOverlay, setKitchenOverlay] = useState<Partial<RestaurantOrder>>({});
  const [customerName, setCustomerName] = useState<string | null>(null);
  const displayOrder = useMemo(() => {
    if (!order) return null;
    return applyStageLockToOrder({ ...order, ...kitchenOverlay });
  }, [order, kitchenOverlay]);

  useRestaurantOrderLifecycleAlert(displayOrder);

  const presentation = useMemo(
    () => getRestaurantOrderPresentation(displayOrder),
    [displayOrder],
  );
  const merchantStatus = useMemo(
    () => (displayOrder ? merchantStatusFromOrder(displayOrder) : null),
    [displayOrder],
  );

  useEffect(() => {
    if (order) logOrderStage(order);
  }, [order]);

  useEffect(() => {
    if (
      !order?.id ||
      (kitchenOverlay.status === undefined && kitchenOverlay.deliveryStatus === undefined)
    ) {
      return;
    }
    const statusMatch =
      kitchenOverlay.status === undefined ||
      String(order.status ?? '').trim().toLowerCase() ===
        String(kitchenOverlay.status).trim().toLowerCase();
    const deliveryMatch =
      kitchenOverlay.deliveryStatus === undefined ||
      String(order.deliveryStatus ?? '').trim().toLowerCase() ===
        String(kitchenOverlay.deliveryStatus).trim().toLowerCase();
    if (statusMatch && deliveryMatch) {
      setKitchenOverlay({});
    }
  }, [order, kitchenOverlay.deliveryStatus, kitchenOverlay.status]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const unsub = subscribeOrderById(
      id,
      (next) => {
        setOrder(next);
        setLoading(false);
      },
      { trackingMode: 'restaurant' },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!order?.userId) {
      setCustomerName(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', order.userId),
      (snap) => {
        if (!snap.exists()) {
          setCustomerName(null);
          return;
        }
        const data = snap.data();
        const name =
          typeof data.displayName === 'string'
            ? data.displayName
            : typeof data.name === 'string'
              ? data.name
              : null;
        setCustomerName(name);
      },
      () => setCustomerName(null),
    );
    return () => unsub();
  }, [order?.userId]);

  const itemCount = useMemo(
    () => order?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0,
    [order?.items],
  );

  async function setStatus(next: RestaurantKitchenAction) {
    if (!order?.id || !displayOrder || saving) return;
    setSaving(next);
    const optimisticPatch = primeRestaurantKitchenOptimistic(order.id, next);
    setKitchenOverlay(optimisticPatch);
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const result = await applyRestaurantKitchenAction(order.id, next, displayOrder);
      if (result === 'skipped_illegal') {
        setKitchenOverlay({});
        clearOrderStageLock(order.id);
        showError('This action is not available for the current order state.');
        return;
      }
      showSuccess('Order updated');
    } catch {
      setKitchenOverlay({});
      clearOrderStageLock(order.id);
      showUserError(new Error('order_update_failed'), {
        role: 'restaurant',
        context: 'restaurant',
        fallback: ROLE_ORDER_UPDATE_ERROR.restaurant,
      });
    } finally {
      setSaving(null);
    }
  }

  async function onReject() {
    if (!order?.id || saving) return;
    setSaving(true);
    try {
      await rejectOrder(order.id);
      showSuccess('Order rejected');
    } catch {
      showUserError(new Error('order_reject_failed'), {
        role: 'restaurant',
        context: 'restaurant',
        fallback: ROLE_ORDER_UPDATE_ERROR.restaurant,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Order Details" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Order Details" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Order not found</Text>
          <Text style={styles.emptySub}>This order may have been removed.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isOrderFresh(order)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Order Details" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Order no longer available</Text>
          <Text style={styles.emptySub}>
            Restaurant dashboards only show orders from the last 24 hours.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Order Details" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.headerTop}>
            <View
              style={[
                styles.stageBadge,
                { backgroundColor: presentation.badgeColor.bg },
              ]}
            >
              <Text style={[styles.stageBadgeText, { color: presentation.badgeColor.fg }]}>
                {presentation.badgeText}
              </Text>
            </View>
            <Text style={styles.timer}>
              {order.createdAtMs
                ? `${Math.max(1, Math.floor((Date.now() - order.createdAtMs) / 60000))} min`
                : 'now'}
            </Text>
          </View>
          <View style={styles.headerMain}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(customerName ?? order.customerName ?? 'C').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.value}>#{order.id.slice(0, 10)}…</Text>
              <Text style={styles.label}>Order ID</Text>
            </View>
            {presentation.showPaymentBadge ? (
              <PaymentBadge paymentStatus="unpaid" />
            ) : (
              <PaymentBadge paymentStatus="paid" />
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Customer</Text>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>
            {customerName ?? order.customerName ?? `Guest ${order.userId.slice(0, 6)}…`}
          </Text>
          <Text style={styles.label}>Phone</Text>
          {order.customerPhone ? (
            <Text style={styles.link} onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}>
              {order.customerPhone}
            </Text>
          ) : (
            <Text style={styles.value}>Not provided</Text>
          )}
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{order.deliveryLocation?.address ?? 'Not provided'}</Text>
          <Text style={styles.label}>Delivery instructions</Text>
          <Text style={styles.value}>{order.notes ?? 'No instructions'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Timeline</Text>
          <OrderTimeline status={merchantStatus ?? 'pending'} />
        </View>

        <OrderItems items={order.items} itemCount={itemCount} />

        <PaymentSummary
          subtotal={order.subtotal}
          tax={order.tax}
          deliveryFee={order.deliveryFee}
          total={order.totalPrice}
        />

        <View style={styles.card}>
          {presentation.derivedStage === 'awaiting_payment' ? (
            <Text style={styles.waiting}>Waiting for payment</Text>
          ) : (
            <OrderActions
              status={merchantStatus ?? 'pending'}
              loading={Boolean(saving)}
              pendingAction={saving}
              onAccept={() => void setStatus('accept')}
              onStartPreparing={() => void setStatus('preparing')}
              onMarkReady={() => void setStatus('ready')}
              onReject={() => void onReject()}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stageBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  stageBadgeText: { fontSize: 12, fontWeight: '800' },
  timer: { color: '#334155', fontWeight: '800' },
  headerMain: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#0F172A', fontWeight: '800' },
  section: { color: '#0F172A', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  label: { color: '#64748B', fontWeight: '700', marginTop: 6 },
  value: { color: '#0F172A', fontWeight: '600', marginTop: 2 },
  link: { color: '#2563EB', fontWeight: '700', marginTop: 2 },
  waiting: { color: '#334155', fontWeight: '700' },
  emptyTitle: { color: '#0F172A', fontWeight: '800', fontSize: 20 },
  emptySub: { color: '#64748B', fontWeight: '600', marginTop: 8, textAlign: 'center' },
});
