import { RestaurantOrdersPanel } from '@/components/restaurant/RestaurantOrdersPanel';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { useFocusEffect } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PAGE = '#FFFFFF';
const PRIMARY = '#16a34a';

/** Restaurant Orders tab — live kitchen queue (realtime). */
export default function HostOrdersScreen() {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const [timezone, setTimezone] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setTimezone(null);
      setProfileLoading(false);
      return undefined;
    }
    setProfileLoading(true);
    const unsub = onSnapshot(
      doc(db, 'restaurants', uid),
      (snap) => {
        const data = snap.data() as { timezone?: unknown; timeZone?: unknown } | undefined;
        const tz =
          typeof data?.timezone === 'string' && data.timezone.trim()
            ? data.timezone.trim()
            : typeof data?.timeZone === 'string' && data.timeZone.trim()
              ? data.timeZone.trim()
              : null;
        setTimezone(tz);
        setProfileLoading(false);
      },
      () => setProfileLoading(false),
    );
    return unsub;
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      // Keep Orders tab focused for push deep links; no-op placeholder for badge clear hooks.
    }, []),
  );

  if (authLoading || profileLoading) {
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
          restaurantTimeZone={timezone}
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
