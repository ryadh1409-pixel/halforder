import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import { subscribeEarningsLedgerEntry } from '@/services/earningsWallet';
import type { EarningsLedgerEntry } from '@/types/earningsWallet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/**
 * Driver transaction details — intentionally lean.
 * No customer, restaurant, items, or address data.
 */
export default function DriverWalletTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<EarningsLedgerEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return undefined;
    }
    return subscribeEarningsLedgerEntry(
      id,
      (e) => {
        setEntry(e);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [id]);

  const snap = entry?.driverSnapshot;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#F5F3FF" />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#A855F7" style={{ marginTop: 40 }} />
      ) : !entry ? (
        <Text style={styles.empty}>Transaction not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Row
            label="Amount Received"
            value={formatWalletMoney(snap?.netAmount ?? entry.amount)}
          />
          <Row label="Delivery Fee" value={formatWalletMoney(snap?.deliveryFee)} />
          <Row label="Bonus" value={formatWalletMoney(snap?.bonus)} />
          <Row label="Date" value={formatWalletLocalDate(entry.createdAt)} />
          <Row label="Time" value={formatWalletLocalTime(entry.createdAt)} />
          <Row label="Status" value={entry.status} />
          <Row label="Wallet Transaction ID" value={entry.id} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0816' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: '#F5F3FF', fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  row: {
    backgroundColor: '#151022',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.16)',
  },
  label: { color: '#8A829E', fontSize: 12, fontWeight: '600' },
  value: { color: '#F5F3FF', fontSize: 15, fontWeight: '600', marginTop: 4 },
  empty: { color: '#8A829E', padding: 20 },
});
