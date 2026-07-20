import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  generateAndStoreEmoAiReport,
  listEmoAiReports,
} from '@/services/emoAi/agent/emoAiReportingService';
import type { EmoAiExecutiveReport, EmoAiReportPeriod } from '@/types/emoAiAgent';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PERIODS: { key: EmoAiReportPeriod | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function EmoAiReportsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<EmoAiReportPeriod | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState<EmoAiReportPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EmoAiExecutiveReport[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await listEmoAiReports({
        period,
        search,
        includeArchived: false,
      });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, search]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onGenerate = async (p: EmoAiReportPeriod) => {
    setGenerating(p);
    setError(null);
    try {
      const report = await generateAndStoreEmoAiReport(p);
      await load();
      router.push(adminRoutes.emoAiReport(report.id) as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenerating(null);
    }
  };

  const subtitle = useMemo(
    () => `${rows.length} report${rows.length === 1 ? '' : 's'}`,
    [rows.length],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AdminHeader title="Emo AI Reports" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <Text style={styles.lead}>
          Executive intelligence from live HalfOrder data — daily, weekly, and
          monthly reports with payment exception monitoring.
        </Text>
        <Text style={styles.meta}>{subtitle}</Text>

        <Text style={styles.section}>Generate</Text>
        <View style={styles.row}>
          {(['daily', 'weekly', 'monthly'] as EmoAiReportPeriod[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.genBtn, generating === p && styles.genBtnBusy]}
              disabled={Boolean(generating)}
              onPress={() => void onGenerate(p)}
            >
              {generating === p ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.genBtnText}>
                  {p === 'daily' ? 'Daily' : p === 'weekly' ? 'Weekly' : 'Monthly'}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>Filter</Text>
        <View style={styles.row}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.chip, period === p.key && styles.chipOn]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.chipText, period === p.key && styles.chipTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search reports…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No reports yet. Generate a Daily report to start.</Text>
        ) : (
          rows.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.card}
              onPress={() => router.push(adminRoutes.emoAiReport(r.id) as never)}
            >
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardMeta}>
                {r.period.toUpperCase()} ·{' '}
                {new Date(r.generatedAtMs).toLocaleString()} ·{' '}
                {r.paymentExceptions?.length ?? 0} payment exceptions
              </Text>
              <Text style={styles.cardCta}>View / Download</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  lead: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  meta: { color: COLORS.textMuted, fontSize: 12, marginBottom: 16 },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  genBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  genBtnBusy: { opacity: 0.7 },
  genBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: {
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderColor: COLORS.primary,
  },
  chipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: COLORS.text },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  error: { color: COLORS.error, marginBottom: 8 },
  empty: { color: COLORS.textMuted, marginTop: 20, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  cardTitle: { fontWeight: '800', color: COLORS.text, fontSize: 15 },
  cardMeta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  cardCta: { color: COLORS.primary, fontWeight: '800', marginTop: 10, fontSize: 13 },
});
