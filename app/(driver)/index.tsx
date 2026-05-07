import AppHeader from '../../components/AppHeader';
import { useAvailableOrders } from '../../hooks/useAvailableOrders';
import { useDriverOrders } from '../../hooks/useDriverOrders';
import { useDriverOnlineStatus } from '../../hooks/useDriverOnlineStatus';
import { useAuth } from '../../services/AuthContext';
import { updateDriverOnlineStatus } from '../../services/driverDispatch';
import { requireRole } from '../../utils/requireRole';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverHubScreen() {
  const { authorized, loading } = requireRole(['driver', 'admin']);
  const { user } = useAuth();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const { online, loading: onlineLoading } = useDriverOnlineStatus(user?.uid);
  const hydratedRef = useRef(false);
  const { orders: availableOrders } = useAvailableOrders(user?.uid);
  const { orders: activeOrders } = useDriverOrders(user?.uid);

  useEffect(() => {
    if (onlineLoading) return;
    setIsOnline(online);
    hydratedRef.current = true;
  }, [online, onlineLoading]);

  const onToggleOnline = (next: boolean) => {
    setIsOnline(next);
    if (!user?.uid || !hydratedRef.current) return;
    updateDriverOnlineStatus(user.uid, next)
      .then(() => {
        console.log('[ONLINE WRITE]', {
          driverId: user.uid,
          path: `drivers/${user.uid}`,
          isOnline: next,
        });
      })
      .catch(() => {});
  };

  if (loading || !authorized) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Driver" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Driver hub</Text>
          <View style={styles.onlineRow}>
            <Text style={styles.onlineLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Switch value={isOnline} onValueChange={onToggleOnline} />
          </View>
        </View>

        <Pressable
          style={styles.cardBtn}
          onPress={() => router.push('/(driver)/orders' as never)}
        >
          <Text style={styles.cardBtnTitle}>Available orders</Text>
          <Text style={styles.cardBtnSub}>
            Pickup queue · real-time ({availableOrders.length})
          </Text>
        </Pressable>

        <Pressable
          style={styles.cardBtn}
          onPress={() => router.push('/(driver)/active' as never)}
        >
          <Text style={styles.cardBtnTitle}>Active delivery</Text>
          <Text style={styles.cardBtnSub}>
            Status updates · live location ({activeOrders.length})
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748B', fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 },
  hero: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  onlineLabel: { fontSize: 16, fontWeight: '700', color: '#334155' },
  cardBtn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginBottom: 12,
  },
  cardBtnTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  cardBtnSub: { marginTop: 4, fontSize: 14, color: '#64748B', fontWeight: '600' },
});
