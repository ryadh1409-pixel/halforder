import { subscribeDriverDeliveryStats } from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverEarningsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState(0);
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const unsub = subscribeDriverDeliveryStats(user.uid, (stats) => {
      setDeliveries(stats.deliveries);
      setEarnings(stats.earnings);
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid]);

  return (
    <SafeAreaView style={styles.screen}>
      {loading ? (
        <ActivityIndicator size="large" color="#00C853" />
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Earnings</Text>
          <Text style={styles.value}>${earnings.toFixed(2)}</Text>
          <Text style={styles.meta}>Completed deliveries: {deliveries}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#22223A', borderRadius: 16, padding: 20 },
  title: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },
  value: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 8 },
  meta: { color: '#D1D5DB', marginTop: 10, fontWeight: '600' },
});
