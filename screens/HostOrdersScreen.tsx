import { RestaurantOrdersPanel } from '@/components/restaurant/RestaurantOrdersPanel';
import { useAuth } from '@/services/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PAGE = '#FFFFFF';
const PRIMARY = '#A855F7';

/**
 * Restaurant Orders tab — same live feed as Dashboard
 * ({@link HostRestaurantOrdersProvider} / {@link RestaurantOrdersPanel}).
 */
export default function HostOrdersScreen() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;

  useFocusEffect(
    useCallback(() => {
      // Keep Orders tab focused for push deep links; no-op placeholder for badge clear hooks.
    }, []),
  );

  if (authLoading) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.muted}>Loading orders…</Text>
      </SafeAreaView>
    );
  }

  if (!uid) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Text style={styles.muted}>Sign in to manage restaurant orders.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>Updates instantly — no refresh needed.</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <RestaurantOrdersPanel
          restaurantId={uid}
          title="Order management"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PAGE,
    padding: 24,
  },
  muted: { marginTop: 10, color: '#64748b', fontSize: 14, textAlign: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: PAGE,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
    fontWeight: '500',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
});
