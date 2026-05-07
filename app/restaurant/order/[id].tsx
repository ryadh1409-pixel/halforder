import AppHeader from '@/components/AppHeader';
import OrderActions from '@/components/orders/OrderActions';
import OrderItemCard from '@/components/orders/OrderItemCard';
import OrderTimeline from '@/components/orders/OrderTimeline';
import { PaymentBadge, StatusBadge } from '@/components/orders/StatusBadge';
import { db } from '@/services/firebase';
import {
  rejectOrder,
  subscribeOrderById,
  updateOrderStatus,
  type RestaurantOrder,
} from '@/services/orderService';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function money(value: number): string {
  return `$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;
}

export default function RestaurantOrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const unsub = subscribeOrderById(id, (next) => {
      setOrder(next);
      setLoading(false);
    });
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

  async function setStatus(next: 'accepted' | 'preparing' | 'ready') {
    if (!order?.id || saving) return;
    setSaving(true);
    try {
      await updateOrderStatus(order.id, next);
      showSuccess('Order updated');
    } catch {
      showError('Could not update order');
    } finally {
      setSaving(false);
    }
  }

  async function onReject() {
    if (!order?.id || saving) return;
    setSaving(true);
    try {
      await rejectOrder(order.id);
      showSuccess('Order rejected');
    } catch {
      showError('Could not reject order');
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

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Order Details" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.headerTop}>
            <StatusBadge status={order.status} />
            <Text style={styles.timer}>{order.createdAtMs ? `${Math.max(1, Math.floor((Date.now() - order.createdAtMs) / 60000))} min` : 'now'}</Text>
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
            <PaymentBadge paymentStatus={order.paymentStatus} />
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
          <Text style={styles.section}>Items ({itemCount})</Text>
          {order.items.map((item) => <OrderItemCard key={`${item.id}-${item.name}`} item={item} />)}
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Timeline</Text>
          <OrderTimeline status={order.status} />
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Payment</Text>
          <View style={styles.line} />
          <View style={styles.itemRow}>
            <Text style={styles.label}>Subtotal</Text>
            <Text style={styles.value}>{money(order.subtotal)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.label}>Tax</Text>
            <Text style={styles.value}>{money(order.tax)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.label}>Delivery Fee</Text>
            <Text style={styles.value}>{money(order.deliveryFee)}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>{money(order.totalPrice)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          {order.status === 'awaiting_payment' ? (
            <Text style={styles.waiting}>Waiting for payment</Text>
          ) : (
            <OrderActions
              status={order.status}
              loading={saving}
              onAccept={() => void setStatus('accepted')}
              onMarkReady={() => void setStatus('ready')}
              onReject={() => void onReject()}
            />
          )}
          {(order.status === 'ready_for_pickup' || order.status === 'ready') ? (
            <Text style={styles.waiting}>Waiting Driver</Text>
          ) : null}
          {(order.status === 'picked_up' ||
            order.status === 'delivered' ||
            order.status === 'rejected' ||
            order.status === 'cancelled') ? (
            <Text style={styles.waiting}>Status: {order.status.replace(/_/g, ' ')}</Text>
          ) : null}
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
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  total: { color: '#0F172A', fontWeight: '800', fontSize: 16, marginTop: 6 },
  line: { height: 1, backgroundColor: '#E2E8F0', marginTop: 10, marginBottom: 6 },
  waiting: { color: '#334155', fontWeight: '700' },
  emptyTitle: { color: '#0F172A', fontWeight: '800', fontSize: 20 },
  emptySub: { color: '#64748B', fontWeight: '600', marginTop: 8, textAlign: 'center' },
});
