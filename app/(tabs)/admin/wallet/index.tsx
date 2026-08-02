import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import {
  subscribeEarningsLedger,
  subscribeEarningsWallet,
} from '@/services/earningsWallet';
import type { EarningsLedgerEntry, EarningsWalletDoc } from '@/types/earningsWallet';
import { ADMIN_EARNINGS_OWNER_ID } from '@/types/earningsWallet';
import { requireRole } from '@/utils/requireRole';
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

export default function AdminWalletScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const router = useRouter();
  const [wallet, setWallet] = useState<EarningsWalletDoc | null>(null);
  const [entries, setEntries] = useState<EarningsLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorized) return undefined;
    const unsubW = subscribeEarningsWallet(
      'admin',
      ADMIN_EARNINGS_OWNER_ID,
      (w) => {
        setWallet(w);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubL = subscribeEarningsLedger(
      'admin',
      ADMIN_EARNINGS_OWNER_ID,
      setEntries,
    );
    return () => {
      unsubW();
      unsubL();
    };
  }, [authorized]);

  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Admin Wallet" fallbackRoute={adminRoutes.home} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.actions}>
            <Pressable
              style={styles.actionBtn}
              onPress={() => router.push(adminRoutes.walletTransfer as never)}
            >
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
              <Text style={styles.actionText}>Transfer</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionSecondary]}
              onPress={() => router.push(adminRoutes.walletConfig as never)}
            >
              <Ionicons name="settings-outline" size={18} color={COLORS.primary} />
              <Text style={[styles.actionText, { color: COLORS.primary }]}>Config</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Current Balance</Text>
            <Text style={styles.heroValue}>
              {formatWalletMoney(wallet?.currentBalance)}
            </Text>
          </View>

          <View style={styles.grid}>
            <StatTile label="Total Revenue" value={formatWalletMoney(wallet?.totalRevenue)} />
            <StatTile
              label="Restaurant Commissions"
              value={formatWalletMoney(wallet?.restaurantCommissions)}
            />
            <StatTile
              label="Driver Commissions"
              value={formatWalletMoney(wallet?.driverCommissions)}
            />
            <StatTile label="Service Fees" value={formatWalletMoney(wallet?.serviceFees)} />
            <StatTile label="Platform Fees" value={formatWalletMoney(wallet?.platformFees)} />
            <StatTile
              label="Promo Bonus Paid"
              value={formatWalletMoney(wallet?.promotionalBonusPaid)}
            />
            <StatTile
              label="Transfers Sent"
              value={formatWalletMoney(wallet?.totalTransfersSent)}
            />
            <StatTile
              label="Net Platform Revenue"
              value={formatWalletMoney(wallet?.netPlatformRevenue)}
            />
          </View>

          <Text style={styles.sectionTitle}>Transaction History</Text>
          {entries.length === 0 ? (
            <Text style={styles.empty}>No wallet transactions yet.</Text>
          ) : (
            <FlatList
              data={entries}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    router.push(adminRoutes.walletTransaction(item.id) as never)
                  }
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {formatWalletMoney(item.signedAmount)} · {item.type}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Source: {item.source ?? item.adminSnapshot?.source ?? '—'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      Ref: {item.referenceId ?? item.adminSnapshot?.referenceId ?? '—'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatWalletLocalDate(item.createdAt)} ·{' '}
                      {formatWalletLocalTime(item.createdAt)} · {item.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#8A829E" />
                </Pressable>
              )}
            />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  content: { padding: 16, paddingBottom: 40 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  actionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionText: { color: '#fff', fontWeight: '700' },
  hero: {
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
  },
  heroLabel: { color: '#C4B5FD', fontWeight: '600' },
  heroValue: { color: '#F5F3FF', fontSize: 32, fontWeight: '800', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statTile: {
    width: '47%',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.18)',
  },
  statLabel: { color: '#8A829E', fontSize: 11, fontWeight: '600' },
  statValue: { color: '#F5F3FF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  sectionTitle: { color: '#F5F3FF', fontSize: 17, fontWeight: '700', marginBottom: 10 },
  empty: { color: '#8A829E' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: '#F5F3FF', fontWeight: '700' },
  rowMeta: { color: '#8A829E', fontSize: 12 },
});
