import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  listRestaurantWalletSummaries,
  type PartnerWalletListItem,
} from '@/services/halfOrderPartnerWallet';
import { requireRole } from '@/utils/requireRole';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminRestaurantWalletsScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const router = useRouter();
  const [rows, setRows] = useState<PartnerWalletListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listRestaurantWalletSummaries();
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.ownerId.toLowerCase().includes(q),
    );
  }, [rows, queryText]);

  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Restaurant Wallets" fallbackRoute={adminRoutes.wallets} />
      <View style={styles.searchWrap}>
        <AppTextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Search restaurant"
          autoCapitalize="none"
        />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.ownerId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No restaurants found.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push(adminRoutes.walletsRestaurant(item.ownerId) as never)
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.ownerId}</Text>
                <Text style={styles.bal}>
                  CA${item.currentBalance.toFixed(2)}
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
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  empty: { color: '#8A829E', textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151022',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  name: { color: '#F5F3FF', fontWeight: '800', fontSize: 15 },
  meta: { color: '#8A829E', fontSize: 12, marginTop: 2 },
  bal: { color: '#C084FC', fontWeight: '800', marginTop: 6 },
});
