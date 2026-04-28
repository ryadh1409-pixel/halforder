import { db } from '@/services/firebase';
import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DailyAnalytics = {
  id: string;
  matchRate: number;
  avgTimeToMatchSec: number;
  activeUsers: number;
  totalOrders: number;
  matchedOrders: number;
};

function subscribeDailyAnalytics(onData: (rows: DailyAnalytics[]) => void): Unsubscribe {
  const q = query(collection(db, 'analytics', 'daily', 'days'), orderBy('date', 'desc'), limit(7));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        matchRate: typeof raw.matchRate === 'number' ? raw.matchRate : 0,
        avgTimeToMatchSec: typeof raw.avgTimeToMatchSec === 'number' ? raw.avgTimeToMatchSec : 0,
        activeUsers: typeof raw.activeUsers === 'number' ? raw.activeUsers : 0,
        totalOrders: typeof raw.totalOrders === 'number' ? raw.totalOrders : 0,
        matchedOrders: typeof raw.matchedOrders === 'number' ? raw.matchedOrders : 0,
      } satisfies DailyAnalytics;
    });
    onData(rows);
  });
}

export default function HalfOrderAnalyticsScreen() {
  const [dailyRows, setDailyRows] = useState<DailyAnalytics[]>([]);

  useEffect(() => subscribeDailyAnalytics(setDailyRows), []);

  const totals = useMemo(() => {
    if (dailyRows.length === 0) {
      return { liquidityScore: 0, avgMatchRate: 0, avgActiveUsers: 0, ordersPerDay: 0 };
    }
    const days = dailyRows.length;
    const matchRateSum = dailyRows.reduce((acc, row) => acc + row.matchRate, 0);
    const activeUsersSum = dailyRows.reduce((acc, row) => acc + row.activeUsers, 0);
    const ordersSum = dailyRows.reduce((acc, row) => acc + row.totalOrders, 0);
    const avgTimeToMatch = dailyRows.reduce((acc, row) => acc + row.avgTimeToMatchSec, 0) / days;
    const avgMatchRate = matchRateSum / days;
    const avgActiveUsers = activeUsersSum / days;
    const ordersPerDay = ordersSum / days;
    const liquidityScore = Number((avgMatchRate * 100 + avgActiveUsers * 0.6 - avgTimeToMatch * 0.3).toFixed(1));
    return {
      liquidityScore: Math.max(0, liquidityScore),
      avgMatchRate,
      avgActiveUsers,
      ordersPerDay: Number(ordersPerDay.toFixed(1)),
    };
  }, [dailyRows]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Analytics Dashboard</Text>
        <Text style={styles.subtitle}>Live marketplace metrics for investor demos.</Text>

        <View style={styles.row}>
          <View style={styles.card}>
            <Text style={styles.value}>{totals.liquidityScore}</Text>
            <Text style={styles.label}>Liquidity Score</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.value}>{(totals.avgMatchRate * 100).toFixed(0)}%</Text>
            <Text style={styles.label}>Match Rate</Text>
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.card}>
            <Text style={styles.value}>{Math.round(totals.avgActiveUsers)}</Text>
            <Text style={styles.label}>Active Users</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.value}>{totals.ordersPerDay}</Text>
            <Text style={styles.label}>Orders / Day</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { color: '#64748B', marginTop: 5, marginBottom: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  value: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
  label: { marginTop: 4, color: '#64748B', fontWeight: '600' },
});
