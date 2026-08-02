import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import {
  subscribeEarningsLedger,
  subscribeEarningsWallet,
} from '@/services/earningsWallet';
import { useAuth } from '@/services/AuthContext';
import type { EarningsLedgerEntry, EarningsWalletDoc } from '@/types/earningsWallet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function DriverWalletScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const driverId = user?.uid ?? '';
  const [wallet, setWallet] = useState<EarningsWalletDoc | null>(null);
  const [entries, setEntries] = useState<EarningsLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return undefined;
    }
    const unsubW = subscribeEarningsWallet(
      'driver',
      driverId,
      (w) => {
        setWallet(w);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubL = subscribeEarningsLedger('driver', driverId, setEntries);
    return () => {
      unsubW();
      unsubL();
    };
  }, [driverId]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {loading ? (
        <ActivityIndicator size="large" color="#A855F7" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Driver Wallet</Text>
          <Text style={styles.subtitle}>Delivery earnings & promotional bonuses</Text>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Current Balance</Text>
            <Text style={styles.heroValue}>
              {formatWalletMoney(wallet?.currentBalance)}
            </Text>
          </View>

          <View style={styles.grid}>
            <StatTile
              label="Pending"
              value={formatWalletMoney(wallet?.pendingBalance)}
            />
            <StatTile
              label="Lifetime"
              value={formatWalletMoney(wallet?.lifetimeEarnings)}
            />
            <StatTile
              label="Deliveries"
              value={`${wallet?.totalDeliveries ?? 0}`}
            />
            <StatTile
              label="Delivery Earnings"
              value={formatWalletMoney(wallet?.deliveryEarnings)}
            />
            <StatTile
              label="Bonus Earnings"
              value={formatWalletMoney(wallet?.bonusEarnings)}
            />
            <StatTile
              label="Withdrawn"
              value={formatWalletMoney(wallet?.totalWithdrawn)}
            />
          </View>

          <Text style={styles.sectionTitle}>Transaction History</Text>
          {entries.length === 0 ? (
            <Text style={styles.empty}>
              Completed deliveries will appear here automatically.
            </Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const snap = item.driverSnapshot;
                return (
                  <Pressable
                    style={styles.row}
                    onPress={() =>
                      router.push(`/(driver)/wallet-transaction/${item.id}` as never)
                    }
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>
                        {formatWalletMoney(item.amount)} received
                      </Text>
                      <Text style={styles.rowMeta}>
                        Fee {formatWalletMoney(snap?.deliveryFee)} · Bonus{' '}
                        {formatWalletMoney(snap?.bonus)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatWalletLocalDate(item.createdAt)} ·{' '}
                        {formatWalletLocalTime(item.createdAt)}
                      </Text>
                      <Text style={styles.status}>{item.status}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#8A829E" />
                  </Pressable>
                );
              }}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0816' },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: '#F5F3FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#8A829E', marginTop: 4, marginBottom: 16 },
  hero: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    padding: 20,
    marginBottom: 14,
  },
  heroLabel: { color: '#C4B5FD', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#F5F3FF', fontSize: 36, fontWeight: '800', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  statTile: {
    width: '47%',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.18)',
  },
  statLabel: { color: '#8A829E', fontSize: 12, fontWeight: '600' },
  statValue: { color: '#F5F3FF', fontSize: 18, fontWeight: '700', marginTop: 4 },
  sectionTitle: {
    color: '#F5F3FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  empty: { color: '#8A829E', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.18)',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: '#F5F3FF', fontWeight: '700', fontSize: 15 },
  rowMeta: { color: '#8A829E', fontSize: 12 },
  status: { color: '#86EFAC', fontSize: 11, fontWeight: '700', marginTop: 4 },
});
