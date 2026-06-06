import { useDriverDeliveryStats } from '@/contexts/DriverRealtimeContext';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function DriverEarningsScreen() {
  const { stats, statsLoading } = useDriverDeliveryStats();

  return (
    <SafeAreaView style={styles.screen}>
      {statsLoading ? (
        <ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heroTitle}>Earnings</Text>
          <Text style={styles.heroSubtitle}>Uber-style delivery payouts · 80% of delivery fee</Text>

          <View style={styles.heroCard}>
            <Text style={styles.heroCardLabel}>Today</Text>
            <Text style={styles.heroCardValue}>${stats.earningsToday.toFixed(2)}</Text>
            <Text style={styles.heroCardMeta}>{stats.deliveriesToday} deliveries</Text>
          </View>

          <View style={styles.grid}>
            <StatTile
              label="Completed"
              value={`${stats.deliveries}`}
              sub="Lifetime deliveries"
            />
            <StatTile
              label="This week"
              value={`$${stats.earningsWeek.toFixed(2)}`}
              sub={`${stats.deliveriesWeek} trips`}
            />
            <StatTile
              label="All time"
              value={`$${stats.earnings.toFixed(2)}`}
              sub="Lifetime earnings"
            />
            <StatTile
              label="Avg / trip"
              value={`$${stats.averageEarning.toFixed(2)}`}
              sub="Driver payout"
            />
            <StatTile
              label="Platform fees"
              value={`$${stats.platformFees.toFixed(2)}`}
              sub="Collected on trips"
            />
          </View>

          <Text style={styles.sectionTitle}>Recent deliveries</Text>
          {stats.breakdown.length === 0 ? (
            <Text style={styles.empty}>Complete a delivery to see earnings here.</Text>
          ) : (
            <FlatList
              data={stats.breakdown}
              keyExtractor={(item) => item.orderId}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>#{item.orderId.slice(-6).toUpperCase()}</Text>
                    <Text style={styles.rowMeta}>{formatDeliveryTime(item.deliveredAtMs)}</Text>
                  </View>
                  <Text style={styles.rowEarning}>+${item.earning.toFixed(2)}</Text>
                </View>
              )}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 16, paddingBottom: 32 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  heroSubtitle: { color: '#9CA3AF', marginTop: 4, marginBottom: 16, fontWeight: '600' },
  heroCard: {
    backgroundColor: '#00C853',
    borderRadius: 18,
    padding: 20,
    marginBottom: 14,
  },
  heroCardLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 13 },
  heroCardValue: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', marginTop: 6 },
  heroCardMeta: { color: 'rgba(255,255,255,0.9)', marginTop: 8, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statTile: {
    width: '48%',
    backgroundColor: '#1c1c2e',
    borderRadius: 14,
    padding: 14,
    flexGrow: 1,
  },
  statLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  statValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 8 },
  statSub: { color: '#6B7280', marginTop: 4, fontWeight: '600', fontSize: 12 },
  sectionTitle: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  empty: { color: '#6B7280', fontWeight: '600', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c2e',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rowBody: { flex: 1 },
  rowTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  rowMeta: { color: '#9CA3AF', marginTop: 4, fontWeight: '600', fontSize: 13 },
  rowEarning: { color: '#00C853', fontWeight: '900', fontSize: 16 },
});
