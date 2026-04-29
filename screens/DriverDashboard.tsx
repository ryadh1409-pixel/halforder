import { Map, MapMarker } from '@/components/Map';
import { useDriverOrders } from '@/hooks/useDriverOrders';
import { updateDriverOnlineStatus, markPickedUp } from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverDashboardScreen() {
  const { authorized, loading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const { orders, loading: ordersLoading } = useDriverOrders(user?.uid);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    updateDriverOnlineStatus(user.uid, isOnline).catch(() => {});
  }, [isOnline, user?.uid]);

  async function handlePickedUp(orderId: string) {
    try {
      await markPickedUp(orderId);
      showSuccess('Order marked as picked up');
    } catch {
      showError('Failed to update order.');
    }
  }

  if (loading || !authorized || ordersLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.subtitle}>Loading driver dashboard...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Driver Dashboard</Text>
          <View style={styles.onlineRow}>
            <Text style={styles.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Switch value={isOnline} onValueChange={setIsOnline} />
          </View>
        </View>

        {orders.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.meta}>No assigned orders.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.orderId}>Order #{order.id}</Text>
              <Text style={styles.meta}>Restaurant: {order.restaurantName}</Text>
              <Text style={styles.meta}>Items: {order.items.join(', ') || 'No items'}</Text>
              <Text style={styles.meta}>Total: ${order.total.toFixed(2)}</Text>
              <Text style={styles.status}>Status: {order.status}</Text>
              <Text style={styles.meta}>
                Customer: {order.customerName ?? 'Customer'}
              </Text>
              <Text style={styles.meta}>
                Phone: {order.customerPhone ?? 'Unavailable'}
              </Text>

              <View style={styles.mapWrap}>
                <Map
                  style={styles.map}
                  initialRegion={{
                    latitude: 43.6532,
                    longitude: -79.3832,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <MapMarker
                    coordinate={{ latitude: 43.6532, longitude: -79.3832 }}
                    title="Customer"
                  />
                </Map>
              </View>

              <Pressable
                style={[styles.primaryButton, order.status === 'picked_up' ? styles.disabled : null]}
                disabled={order.status === 'picked_up'}
                onPress={() => handlePickedUp(order.id)}
              >
                <Text style={styles.primaryText}>Picked Up</Text>
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
  mapWrap: { marginTop: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  map: { width: '100%', height: 120 },
  primaryButton: { marginTop: 10, height: 42, borderRadius: 10, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  secondaryButton: { marginTop: 8, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#334155', fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
