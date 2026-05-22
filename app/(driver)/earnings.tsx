import { useDriverDeliveryStats } from '@/contexts/DriverRealtimeContext';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverEarningsScreen() {
  const { stats, statsLoading } = useDriverDeliveryStats();

  return (
    <SafeAreaView style={styles.screen}>
      {statsLoading ? (
        <ActivityIndicator size="large" color="#00C853" />
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Earnings</Text>
          <Text style={styles.value}>${stats.earnings.toFixed(2)}</Text>
          <Text style={styles.meta}>Completed deliveries: {stats.deliveries}</Text>
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
