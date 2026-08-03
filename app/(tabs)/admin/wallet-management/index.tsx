import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  formatWalletLocalDate,
  formatWalletLocalTime,
  formatWalletMoney,
} from '@/lib/earningsWalletFormat';
import {
  listEarningsWalletManagementSummaries,
  type EarningsWalletManagementSummary,
} from '@/services/earningsWallet';
import {
  listCustomerWalletSummaries,
  type CustomerWalletSummary,
} from '@/services/halfOrderBalance';
import type { UserRole } from '@/services/userService';
import { useRequireRole } from '@/utils/requireRole';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_ROLES: UserRole[] = ['admin'];

type WalletKind = 'restaurant' | 'driver' | 'customer';

export default function AdminWalletManagementScreen() {
  const { authorized, loading: roleLoading } = useRequireRole(ADMIN_ROLES);
  const router = useRouter();
  const [kind, setKind] = useState<WalletKind>('restaurant');
  const [partnerRows, setPartnerRows] = useState<EarningsWalletManagementSummary[]>(
    [],
  );
  const [customerRows, setCustomerRows] = useState<CustomerWalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');

  const load = useCallback(async (ownerType: WalletKind) => {
    setLoading(true);
    try {
      if (ownerType === 'customer') {
        setCustomerRows(await listCustomerWalletSummaries());
        setPartnerRows([]);
      } else {
        setPartnerRows(await listEarningsWalletManagementSummaries(ownerType));
        setCustomerRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    void load(kind);
  }, [authorized, kind, load]);

  const filteredPartners = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return partnerRows;
    return partnerRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.ownerId.toLowerCase().includes(q),
    );
  }, [partnerRows, queryText]);

  const filteredCustomers = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return customerRows;
    return customerRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.userId.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false),
    );
  }, [customerRows, queryText]);

  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const searchPlaceholder =
    kind === 'customer'
      ? 'Search name, user ID, or email'
      : `Search ${kind} name or ID`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Wallet Management" fallbackRoute={adminRoutes.home} />
      <Text style={styles.lead}>
        Manage Restaurant, Driver, and Customer wallets for payouts, support,
        refunds, and corrections.
      </Text>

      <View style={styles.typeRow}>
        {(
          [
            ['restaurant', 'Restaurants'],
            ['driver', 'Drivers'],
            ['customer', 'Customers'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.typeBtn, kind === value && styles.typeBtnActive]}
            onPress={() => {
              setKind(value);
              setQueryText('');
            }}
          >
            <Text
              style={[styles.typeText, kind === value && styles.typeTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchWrap}>
        <AppTextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder={searchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={{ marginTop: 24 }}
        />
      ) : kind === 'customer' ? (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No customer wallets found.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push(
                  adminRoutes.walletManagementCustomer(item.userId) as never,
                )
              }
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  User ID: {item.userId}
                </Text>
                {item.email ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    Email: {item.email}
                  </Text>
                ) : null}
                <Text style={styles.bal}>
                  Balance: {formatWalletMoney(item.currentBalance)}
                </Text>
                <Text style={styles.meta}>
                  Credits: {formatWalletMoney(item.totalCredits)} · Debits:{' '}
                  {formatWalletMoney(item.totalDebits)}
                </Text>
                <Text style={styles.meta}>
                  Last activity: {formatWalletLocalDate(item.lastActivity)}{' '}
                  {formatWalletLocalTime(item.lastActivity)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8A829E" />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={filteredPartners}
          keyExtractor={(item) => `${item.ownerType}_${item.ownerId}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No {kind} wallets found.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push(
                  adminRoutes.walletManagementDetail(
                    item.ownerType,
                    item.ownerId,
                  ) as never,
                )
              }
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  ID: {item.ownerId}
                </Text>
                <Text style={styles.bal}>
                  Balance: {formatWalletMoney(item.currentBalance)}
                </Text>
                <Text style={styles.meta}>
                  Total Earnings: {formatWalletMoney(item.totalEarnings)}
                </Text>
                <Text style={styles.meta}>
                  Pending: {formatWalletMoney(item.pendingBalance)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8A829E" />
            </Pressable>
          )}
        />
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
  lead: {
    color: '#8A829E',
    paddingHorizontal: 16,
    marginBottom: 10,
    lineHeight: 20,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  typeBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeText: { color: '#C4B5FD', fontWeight: '700', fontSize: 13 },
  typeTextActive: { color: '#fff' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  empty: { color: '#8A829E', textAlign: 'center', marginTop: 24 },
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
  name: { color: '#F5F3FF', fontWeight: '800', fontSize: 16 },
  meta: { color: '#8A829E', fontSize: 12 },
  bal: { color: '#C084FC', fontWeight: '800', marginTop: 4 },
});
