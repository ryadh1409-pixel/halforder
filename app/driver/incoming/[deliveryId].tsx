import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  acceptDelivery,
  getCurrentDriverId,
  rejectDelivery,
  subscribeDriverIncomingDelivery,
  type DriverDelivery,
} from '@/services/driverSystem';
import { showError, showSuccess } from '@/utils/toast';

export default function IncomingOrderScreen() {
  const router = useRouter();
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const driverId = getCurrentDriverId();
  const [loading, setLoading] = useState(true);
  const [incoming, setIncoming] = useState<DriverDelivery | null>(null);

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeDriverIncomingDelivery(driverId, (row) => {
      setIncoming(row && row.id === deliveryId ? row : null);
      setLoading(false);
    });
    return () => unsub();
  }, [deliveryId, driverId]);

  const estimatedEarnings = useMemo(() => '$6.50', []);
  const distanceLabel = useMemo(() => '2.1 km', []);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!driverId || !incoming) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.empty}>No incoming request found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Incoming Order</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Restaurant</Text>
          <Text style={styles.value}>Assigned Restaurant</Text>

          <Text style={styles.label}>Delivery distance</Text>
          <Text style={styles.value}>{distanceLabel}</Text>

          <Text style={styles.label}>Estimated earnings</Text>
          <Text style={styles.earnings}>{estimatedEarnings}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.rejectBtn}
            onPress={() => {
              void rejectDelivery(incoming.id)
                .then(() => {
                  showSuccess('Delivery rejected');
                  router.replace('/driver/home' as never);
                })
                .catch(() => showError('Could not reject delivery.'));
            }}
          >
            <Text style={styles.rejectText}>Reject</Text>
          </Pressable>
          <Pressable
            style={styles.acceptBtn}
            onPress={() => {
              void acceptDelivery(incoming.id, driverId, incoming.orderId)
                .then(() => {
                  showSuccess('Delivery accepted');
                  router.replace(`/driver/active/${incoming.id}` as never);
                })
                .catch(() => showError('Could not accept delivery.'));
            }}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  card: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1F2937', padding: 14, gap: 8 },
  label: { color: '#9CA3AF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  value: { color: '#E5E7EB', fontSize: 17, fontWeight: '700' },
  earnings: { color: '#34D399', fontSize: 24, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10 },
  rejectBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  rejectText: { color: '#E5E7EB', fontWeight: '800', fontSize: 16 },
  acceptText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  empty: { color: '#CBD5E1', fontSize: 15, fontWeight: '600' },
});
