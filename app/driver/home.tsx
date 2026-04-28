import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ensureDriverProfile,
  getCurrentDriverId,
  setDriverOnline,
  subscribeDriverActiveDelivery,
  subscribeDriverIncomingDelivery,
  subscribeDriverProfile,
  type DriverDelivery,
  type DriverProfile,
} from '@/services/driverSystem';
import { showError, showNotice } from '@/utils/toast';

export default function DriverHomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [incoming, setIncoming] = useState<DriverDelivery | null>(null);
  const [active, setActive] = useState<DriverDelivery | null>(null);
  const driverId = getCurrentDriverId();

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    void ensureDriverProfile(driverId).catch(() => {});
    const unsubProfile = subscribeDriverProfile(driverId, (d) => {
      setDriver(d);
      setLoading(false);
    });
    const unsubIncoming = subscribeDriverIncomingDelivery(driverId, setIncoming);
    const unsubActive = subscribeDriverActiveDelivery(driverId, setActive);
    return () => {
      unsubProfile();
      unsubIncoming();
      unsubActive();
    };
  }, [driverId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!driverId) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.empty}>Sign in as a driver to continue.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Driver Home</Text>
        <Text style={styles.subtitle}>Manage your live delivery status.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{driver?.name ?? 'Driver'}</Text>
              <Text style={styles.meta}>{driver?.vehicle ?? 'Vehicle'} · ⭐ {driver?.rating.toFixed(1) ?? '4.8'}</Text>
            </View>
            <Switch
              value={driver?.isOnline === true}
              onValueChange={(v) => {
                void setDriverOnline(driverId, v).catch(() => {
                  showError('Could not update online status.');
                });
              }}
            />
          </View>
          <Pressable
            style={styles.onlineBtn}
            onPress={() => {
              void setDriverOnline(driverId, true)
                .then(() => showNotice('Driver status', 'You are now online'))
                .catch(() => showError('Could not go online.'));
            }}
          >
            <Text style={styles.onlineBtnText}>Go Online</Text>
          </Pressable>
        </View>

        {incoming ? (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push(`/driver/incoming/${incoming.id}` as never)
            }
          >
            <Text style={styles.cardTitle}>Incoming Delivery Request</Text>
            <Text style={styles.meta}>Order: {incoming.orderId}</Text>
            <Text style={styles.link}>Open request →</Text>
          </Pressable>
        ) : null}

        {active ? (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push(`/driver/active/${active.id}` as never)
            }
          >
            <Text style={styles.cardTitle}>Active Delivery</Text>
            <Text style={styles.meta}>Status: {active.status.replace('_', ' ')}</Text>
            <Text style={styles.link}>Open active delivery →</Text>
          </Pressable>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No active order</Text>
            <Text style={styles.meta}>Stay online to receive delivery requests.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, marginBottom: 4, color: '#64748B', fontSize: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  meta: { color: '#64748B', marginTop: 6, fontWeight: '600' },
  onlineBtn: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  onlineBtnText: { color: '#FFFFFF', fontWeight: '800' },
  link: { marginTop: 10, color: '#2563EB', fontWeight: '700' },
  empty: { color: '#64748B', fontSize: 16, fontWeight: '600' },
});
