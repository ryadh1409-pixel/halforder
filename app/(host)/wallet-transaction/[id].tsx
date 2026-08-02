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

export default function HostWalletTransactionScreen() {
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

  const snap = entry?.restaurantSnapshot;

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
          <Row label="Order Number" value={snap?.orderNumber ?? entry.orderId ?? '—'} />
          <Row label="Receipt Number" value={snap?.receiptNumber ?? '—'} />
          <Row label="Customer Name" value={snap?.customerName ?? '—'} />
          <Row label="Delivery Address" value={snap?.deliveryAddress ?? '—'} />
          <Row label="Payment Method" value={snap?.paymentMethod ?? '—'} />
          <Row label="Order Status" value={snap?.orderStatus ?? entry.status} />
          <Row label="Date" value={formatWalletLocalDate(entry.createdAt)} />
          <Row label="Time" value={formatWalletLocalTime(entry.createdAt)} />
          <Row label="Subtotal" value={formatWalletMoney(snap?.subtotal)} />
          <Row label="Service Fee" value={formatWalletMoney(snap?.serviceFee)} />
          <Row label="Taxes" value={formatWalletMoney(snap?.taxes)} />
          <Row
            label="Restaurant Commission"
            value={formatWalletMoney(snap?.restaurantCommission)}
          />
          <Row
            label="Net Restaurant Earnings"
            value={formatWalletMoney(snap?.netRestaurantEarnings ?? entry.amount)}
          />
          <Row label="Wallet Transaction ID" value={entry.id} />
          <Row
            label="Balance After Transaction"
            value={formatWalletMoney(entry.runningBalance)}
          />

          <Text style={styles.itemsTitle}>Items Ordered</Text>
          {(snap?.items ?? []).length === 0 ? (
            <Text style={styles.empty}>No item snapshot stored.</Text>
          ) : (
            (snap?.items ?? []).map((it, idx) => (
              <View key={`${it.name}-${idx}`} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {it.quantity}× {it.name}
                </Text>
                <Text style={styles.itemPrice}>{formatWalletMoney(it.lineTotal)}</Text>
              </View>
            ))
          )}
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
  itemsTitle: {
    color: '#F5F3FF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168, 85, 247, 0.12)',
  },
  itemName: { color: '#EDE9FE', flex: 1, paddingRight: 8 },
  itemPrice: { color: '#C4B5FD', fontWeight: '700' },
  empty: { color: '#8A829E', padding: 20 },
});
