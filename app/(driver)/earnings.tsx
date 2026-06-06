import { useDriverDeliveryStats } from '@/contexts/DriverRealtimeContext';
import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatDeliveryTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return 'Completed';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DriverEarningsScreen() {
  const { stats, statsLoading } = useDriverDeliveryStats();

  return (
    <SafeAreaView style={styles.screen}>
      {statsLoading ? (
        <ActivityIndicator size="large" color="#00C853" />
      ) : (
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>Today&apos;s earnings</Text>
            <Text style={styles.value}>${stats.earningsToday.toFixed(2)}</Text>
            <Text style={styles.meta}>Completed today: {stats.deliveriesToday}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>All-time earnings</Text>
            <Text style={styles.valueSecondary}>${stats.earnings.toFixed(2)}</Text>
            <Text style={styles.meta}>Total deliveries: {stats.deliveries}</Text>
          </View>

          <Text style={styles.sectionTitle}>Per-delivery breakdown</Text>
          {stats.breakdown.length === 0 ? (
            <Text style={styles.empty}>No completed deliveries yet.</Text>
          ) : (
            <FlatList
              data={stats.breakdown}
              keyExtractor={(item) => item.orderId}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>Order #{item.orderId.slice(-6).toUpperCase()}</Text>
                    <Text style={styles.rowMeta}>{formatDeliveryTime(item.deliveredAtMs)}</Text>
                  </View>
                  <Text style={styles.rowEarning}>+${item.earning.toFixed(2)}</Text>
                </View>
              )}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1a1a2e', padding: 16 },
  content: { flex: 1 },
  card: { backgroundColor: '#22223A', borderRadius: 16, padding: 20, marginBottom: 14 },
  title: { color: '#9CA3AF', fontSize: 14, fontWeight: '700' },
  value: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 8 },
  valueSecondary: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 8 },
  meta: { color: '#D1D5DB', marginTop: 10, fontWeight: '600' },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },
  empty: { color: '#6B7280', fontWeight: '600', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22223A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  rowMeta: { color: '#9CA3AF', marginTop: 4, fontWeight: '600', fontSize: 13 },
  rowEarning: { color: '#00C853', fontWeight: '900', fontSize: 16 },
});
