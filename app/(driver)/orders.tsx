import AppHeader from '../../components/AppHeader';
import { useAvailableOrders } from '../../hooks/useAvailableOrders';
import { useAuth } from '../../services/AuthContext';
import { acceptDriverOrder } from '../../services/driverService';
import { requireRole } from '../../utils/requireRole';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverOrdersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const { orders, loading } = useAvailableOrders();
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);

  async function onAccept(orderId: string) {
    if (!user?.uid) return;
    const driver = {
      id: user.uid,
      name: user.displayName?.trim() || 'Driver',
      phone: user.phoneNumber ?? null,
      isOnline: true,
    };
    try {
      setAcceptingOrderId(orderId);
      const result = await acceptDriverOrder(orderId, driver);
      if (!result.ok) {
        if (result.reason === 'already_assigned') {
          showError('This order was accepted by another driver.');
        } else {
          showError('Could not accept order.');
        }
        return;
      }
      showSuccess('Order assigned to you');
      router.push('/(driver)/active' as never);
    } catch {
      showError('Could not accept order.');
    } finally {
      setAcceptingOrderId(null);
    }
  }

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Available" />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {orders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No pending orders</Text>
              <Text style={styles.emptySub}>
                New customer orders appear here in real time.
              </Text>
            </View>
          ) : (
            orders.map((order) => (
              <Pressable key={order.id} style={styles.card} onPress={() => onAccept(order.id)}>
                <Text style={styles.cardTitle}>{order.restaurantName}</Text>
                <Text style={styles.meta}>#{order.id.slice(0, 10)}…</Text>
                <Text style={styles.meta}>
                  {order.items.map((i) => `${i.qty}x ${i.name}`).join(', ') || 'Items'}
                </Text>
                <Text style={styles.meta}>Total ${order.total.toFixed(2)}</Text>
                <Pressable
                  style={[styles.primary, acceptingOrderId === order.id && styles.primaryDisabled]}
                  disabled={acceptingOrderId === order.id}
                  onPress={() => onAccept(order.id)}
                >
                  <Text style={styles.primaryText}>
                    {acceptingOrderId === order.id ? 'Accepting...' : 'Accept'}
                  </Text>
                </Pressable>
              </Pressable>
            ))
          )}
          <Pressable style={styles.link} onPress={() => router.push('/(driver)/active' as never)}>
            <Text style={styles.linkText}>Go to active delivery →</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748B' },
  list: { padding: 16, paddingBottom: 40 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySub: { marginTop: 8, color: '#64748B', fontWeight: '600' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  meta: { marginTop: 6, color: '#475569', fontWeight: '600' },
  hint: { marginTop: 4, color: '#94A3B8', fontSize: 12 },
  primary: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
