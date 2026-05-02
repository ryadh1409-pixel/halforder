import AppHeader from '../../components/AppHeader';
import { useAvailableOrders } from '../../hooks/useAvailableOrders';
import { useAuth } from '../../services/AuthContext';
import { acceptDeliveryOrder, acceptGroupDelivery } from '../../services/driverService';
import { requireRole } from '../../utils/requireRole';
import { showError, showSuccess } from '../../utils/toast';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverOrdersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const { orders, loading } = useAvailableOrders();

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { groupId: string; orderId: string; count: number; total: number; name: string }
    >();
    for (const o of orders) {
      const key = o.groupId ?? o.id;
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        cur.total += o.total;
      } else {
        map.set(key, {
          groupId: key,
          orderId: o.id,
          count: 1,
          total: o.total,
          name: o.restaurantName,
        });
      }
    }
    return [...map.values()];
  }, [orders]);

  async function onAccept(groupId: string, orderId: string) {
    if (!user?.uid) return;
    const driver = {
      id: user.uid,
      name: user.displayName?.trim() || 'Driver',
      phone: user.phoneNumber ?? null,
      isOnline: true,
    };
    try {
      await acceptGroupDelivery(groupId, driver);
      showSuccess('Orders assigned to you');
    } catch {
      try {
        await acceptDeliveryOrder(orderId, driver);
        showSuccess('Order assigned to you');
      } catch {
        showError('Could not accept order.');
      }
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
          {grouped.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No orders ready for pickup</Text>
              <Text style={styles.emptySub}>
                Restaurants mark orders “ready” — they appear here live.
              </Text>
            </View>
          ) : (
            grouped.map((g) => (
              <View key={g.groupId} style={styles.card}>
                <Text style={styles.cardTitle}>{g.name}</Text>
                <Text style={styles.meta}>{g.count} order(s) · ${g.total.toFixed(2)}</Text>
                <Text style={styles.hint}>Group {g.groupId.slice(0, 12)}…</Text>
                <Pressable style={styles.primary} onPress={() => onAccept(g.groupId, g.orderId)}>
                  <Text style={styles.primaryText}>Accept</Text>
                </Pressable>
              </View>
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
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, alignSelf: 'center' },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
