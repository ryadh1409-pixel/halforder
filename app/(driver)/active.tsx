import { isDriverActiveMarketplaceOrder } from '@/lib/driverHubActiveOrders';
import {
  clearDriverActiveRouteMemory,
  isDriverHubOrderForceCompleted,
  setDriverActiveRouteOrderId,
} from '@/lib/driverHubOrdersStore';
import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { useDriverOrders } from '../../hooks/useDriverOrders';
import { useAuth } from '../../services/AuthContext';
import { requireRole } from '../../utils/requireRole';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverActiveScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const { orders, loading } = useDriverOrders(user?.uid);
  const driverUid = user?.uid?.trim() ?? '';
  /** Only in-progress deliveries — never auto-open completed/delivered orders. */
  const firstActiveOrderId = useMemo(() => {
    for (const o of orders) {
      if (
        isDriverActiveMarketplaceOrder(
          {
            driverId: o.driverId,
            assignedDriverId: o.assignedDriverId,
            deliveryStatus: o.marketplaceCourierStatus,
            status: o.status,
            deliveredAtMs: o.deliveredAtMs ?? null,
          },
          driverUid,
        )
      ) {
        return o.id;
      }
    }
    return '';
  }, [orders, driverUid]);
  const redirectedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!firstActiveOrderId) {
      redirectedForIdRef.current = null;
      setDriverActiveRouteOrderId(null);
      if (orders.length > 0) {
        router.replace(DRIVER_ROUTES.hub as never);
      }
      return;
    }
    if (isDriverHubOrderForceCompleted(firstActiveOrderId)) {
      clearDriverActiveRouteMemory(firstActiveOrderId, 'active_route_guard');
      router.replace(DRIVER_ROUTES.hub as never);
      return;
    }
    if (redirectedForIdRef.current === firstActiveOrderId) return;
    redirectedForIdRef.current = firstActiveOrderId;
    setDriverActiveRouteOrderId(firstActiveOrderId);
    router.replace(DRIVER_ROUTES.activeOrder(firstActiveOrderId) as never);
  }, [loading, firstActiveOrderId, orders.length]);

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : (
        <View style={styles.list}>
          {orders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🚚</Text>
              <Text style={styles.emptyTitle}>No active deliveries</Text>
              <Text style={styles.emptySub}>Accept an order from the queue first.</Text>
              <Pressable style={styles.secondary} onPress={() => router.push(DRIVER_ROUTES.hub as never)}>
                <Text style={styles.secondaryText}>Browse available</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.centered}>
              <ActivityIndicator color="#16A34A" />
              <Text style={styles.muted}>Opening your active delivery...</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#94A3B8' },
  list: { flex: 1, padding: 16, paddingBottom: 40 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1E293B',
    padding: 20,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  emptySub: { marginTop: 8, color: '#94A3B8', fontWeight: '600', textAlign: 'center' },
  secondary: {
    marginTop: 16,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  secondaryText: { color: '#CBD5E1', fontWeight: '600', marginTop: 4 },
});
