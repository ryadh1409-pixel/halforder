import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { requireRole } from '@/utils/requireRole';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminWalletsHubScreen() {
  const { authorized, loading } = requireRole(['admin']);
  const router = useRouter();

  if (loading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Wallets" fallbackRoute={adminRoutes.home} />
      <View style={styles.content}>
        <Text style={styles.lead}>
          HalfOrder Balance for Restaurants and Drivers
        </Text>

        <Pressable
          style={styles.card}
          onPress={() => router.push(adminRoutes.walletsRestaurants as never)}
        >
          <Ionicons name="restaurant-outline" size={22} color={COLORS.primary} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Restaurant Wallets</Text>
            <Text style={styles.cardSub}>Search, open, and send balance</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8A829E" />
        </Pressable>

        <Pressable
          style={styles.card}
          onPress={() => router.push(adminRoutes.walletsDrivers as never)}
        >
          <Ionicons name="bicycle-outline" size={22} color={COLORS.primary} />
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Driver Wallets</Text>
            <Text style={styles.cardSub}>Search, open, and send balance</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#8A829E" />
        </Pressable>
      </View>
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
  content: { padding: 16, gap: 12 },
  lead: { color: '#8A829E', marginBottom: 8, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#151022',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
  },
  cardBody: { flex: 1 },
  cardTitle: { color: '#F5F3FF', fontWeight: '800', fontSize: 16 },
  cardSub: { color: '#8A829E', marginTop: 2, fontSize: 13 },
});
