import AppHeader from '../components/AppHeader';
import { useAvailableOrders } from '../hooks/useAvailableOrders';
import { useDriverOrders } from '../hooks/useDriverOrders';
import { useAuth } from '../services/AuthContext';
import { acceptDriverOrder, updateDriverOnlineStatus } from '../services/driverService';
import { updateOrderStatus } from '../services/orderService';
import { requireRole } from '../utils/requireRole';
import { showError, showSuccess } from '../utils/toast';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverDashboardScreen() {
  const { authorized, loading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const { orders, loading: ordersLoading } = useDriverOrders(user?.uid);
  const { orders: availableOrders, loading: availableLoading } = useAvailableOrders();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    updateDriverOnlineStatus(user.uid, isOnline).catch(() => {});
  }, [isOnline, user?.uid]);

  async function handleAcceptDelivery(orderId: string) {
    if (!user?.uid) return;
    try {
      const result = await acceptDriverOrder(orderId, {
        id: user.uid,
        name: user.displayName?.trim() || 'Driver',
        phone: user.phoneNumber ?? null,
        isOnline,
      });
      if (!result.ok) throw new Error(result.reason ?? 'accept_failed');
      showSuccess('Delivery accepted');
    } catch {
      showError('Failed to accept delivery.');
    }
  }

  async function handleComplete(orderId: string) {
    try {
      await updateOrderStatus(orderId, 'delivered');
      showSuccess('Delivery completed');
    } catch {
      showError('Failed to complete delivery.');
    }
  }

  if (loading || !authorized || ordersLoading || availableLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.subtitle}>Loading driver dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Driver Dashboard" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Driver Dashboard</Text>
          <View style={styles.onlineRow}>
            <Text style={styles.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Switch value={isOnline} onValueChange={setIsOnline} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Available Deliveries</Text>
        {availableOrders.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.meta}>No pending deliveries right now.</Text>
          </View>
        ) : (
          availableOrders.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.orderId}>Order #{order.id}</Text>
              <Text style={styles.meta}>Restaurant: {order.restaurantName}</Text>
              <Text style={styles.meta}>Total earnings: ${order.total.toFixed(2)}</Text>
              <Pressable style={styles.primaryButton} onPress={() => handleAcceptDelivery(order.id)}>
                <Text style={styles.primaryText}>Accept Delivery</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>My Deliveries</Text>
        {orders.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.meta}>No assigned orders.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.orderId}>Order #{order.id}</Text>
              <Text style={styles.meta}>Restaurant: {order.restaurantName}</Text>
              <Text style={styles.meta}>
                Items: {order.items.map((item) => `${item.qty}x ${item.name}`).join(', ') || 'No items'}
              </Text>
              <Text style={styles.meta}>Total: ${order.total.toFixed(2)}</Text>
              <Text style={styles.status}>Status: {order.status}</Text>
              <Text style={styles.meta}>
                Customer: {order.customerName ?? 'Customer'}
              </Text>
              <Text style={styles.meta}>
                Phone: {order.customerPhone ?? 'Unavailable'}
              </Text>

              <Pressable
                style={[
                  styles.primaryButton,
                  (order.status === 'delivered' ||
                    order.status === 'pending_driver' ||
                    order.status === 'restaurant_accepted') &&
                    styles.disabled,
                ]}
                disabled={
                  order.status === 'delivered' ||
                  order.status === 'pending_driver' ||
                  order.status === 'restaurant_accepted'
                }
                onPress={() => updateOrderStatus(order.id, 'on_the_way')}
              >
                <Text style={styles.primaryText}>Start Delivery</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryButton,
                  (order.status === 'delivered' ||
                    order.status === 'pending_driver' ||
                    order.status === 'restaurant_accepted') &&
                    styles.disabled,
                ]}
                disabled={
                  order.status === 'delivered' ||
                  order.status === 'pending_driver' ||
                  order.status === 'restaurant_accepted'
                }
                onPress={() => handleComplete(order.id)}
              >
                <Text style={styles.secondaryText}>Complete Delivery</Text>
              </Pressable>
              {order.customerPhone ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
                >
                  <Text style={styles.secondaryText}>Call Customer</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 26 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#64748B', fontWeight: '600' },
  sectionTitle: { color: '#0F172A', fontSize: 20, fontWeight: '800', marginBottom: 10, marginTop: 8 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onlineLabel: { color: '#334155', fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  orderId: { color: '#0F172A', fontWeight: '800', fontSize: 18, marginBottom: 2 },
  meta: { color: '#475569', marginTop: 4, fontWeight: '600' },
  status: { color: '#1D4ED8', marginTop: 6, fontWeight: '800' },
  primaryButton: { marginTop: 10, height: 42, borderRadius: 10, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButton: { marginTop: 8, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#334155', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
