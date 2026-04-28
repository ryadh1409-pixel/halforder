import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isDemoModeEnabled, setDemoModeEnabled } from '@/services/halforderDemoMode';
import { seedDemoDataIfNeeded } from '@/services/halforderSimulation';
import { showError, showSuccess } from '@/utils/toast';

export default function HalfOrderDemoLauncherScreen() {
  const router = useRouter();
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void isDemoModeEnabled().then((v) => {
      if (mounted) setDemoEnabled(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function toggleDemoMode(value: boolean) {
    setSaving(true);
    try {
      await setDemoModeEnabled(value);
      if (value) {
        await seedDemoDataIfNeeded();
      }
      setDemoEnabled(value);
      showSuccess(value ? 'Demo mode enabled' : 'Demo mode disabled');
    } catch {
      showError('Could not update demo mode.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>HalfOrder MVP</Text>
        <Text style={styles.subtitle}>Investor demo controls and role-based app entry.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Demo Mode</Text>
              <Text style={styles.meta}>Keeps marketplace activity alive with simulations.</Text>
            </View>
            <Switch value={demoEnabled} disabled={saving} onValueChange={(v) => void toggleDemoMode(v)} />
          </View>
        </View>

        <Pressable style={styles.primary} onPress={() => router.push('/halforder/home' as never)}>
          <Text style={styles.primaryText}>Open User App</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/host/dashboard' as never)}>
          <Text style={styles.secondaryText}>Open Host Dashboard</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/driver/home' as never)}>
          <Text style={styles.secondaryText}>Open Driver App</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/halforder/analytics' as never)}>
          <Text style={styles.secondaryText}>Open Analytics Dashboard</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { color: '#64748B', fontWeight: '600', marginBottom: 6 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 14, marginBottom: 8 },
  cardTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800' },
  meta: { marginTop: 6, color: '#64748B' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primary: { height: 50, borderRadius: 12, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondary: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#0F172A', fontWeight: '700', fontSize: 15 },
});
