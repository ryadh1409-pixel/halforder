import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  archiveEmoAiReport,
  findReportFirestoreDocId,
  getEmoAiReport,
  shareEmoAiReport,
} from '@/services/emoAi/agent/emoAiReportingService';
import { renderEmoAiReportPlainText } from '@/services/emoAi/agent/emoAiPdfGenerator';
import type { EmoAiExecutiveReport } from '@/types/emoAiAgent';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export default function EmoAiReportDetailScreen() {
  const router = useRouter();
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const [report, setReport] = useState<EmoAiExecutiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = String(reportId ?? '');
        const row = await getEmoAiReport(id);
        if (!cancelled) setReport(row);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load report');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const onShare = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await shareEmoAiReport(report);
    } finally {
      setBusy(false);
    }
  };

  const onArchive = async () => {
    if (!report) return;
    setBusy(true);
    try {
      const docId = await findReportFirestoreDocId(report.id);
      if (docId) await archiveEmoAiReport(docId);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AdminHeader title="Report" />
        <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
      </SafeAreaView>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AdminHeader title="Report" />
        <Text style={styles.error}>{error || 'Report not found'}</Text>
      </SafeAreaView>
    );
  }

  const e = report.executiveSummary;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AdminHeader title="Emo AI Report" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>AI GENERATED</Text>
          <Text style={styles.period}>{report.period.toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>
          Generated {new Date(report.generatedAtMs).toLocaleString()}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void onShare()} disabled={busy}>
            <Text style={styles.primaryBtnText}>Download / Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void onArchive()} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Archive</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.h2}>Executive Summary</Text>
        <View style={styles.grid}>
          <Kpi label="New Users" value={String(e.newUsers)} />
          <Kpi label="Active Users" value={String(e.activeUsers)} />
          <Kpi label="Returning" value={String(e.returningUsers)} />
          <Kpi label="New Orders" value={String(e.newOrders)} />
          <Kpi label="Completed" value={String(e.completedOrders)} />
          <Kpi label="Cancelled" value={String(e.cancelledOrders)} />
          <Kpi label="Failed" value={String(e.failedOrders)} />
          <Kpi label="Revenue" value={money(e.revenue)} />
          <Kpi label="AOV" value={money(e.averageOrderValue)} />
          <Kpi label="Avg Split" value={money(e.averageSplitValue)} />
          <Kpi label="Top Restaurant" value={e.mostPopularRestaurant} />
          <Kpi label="Top Meal" value={e.mostPopularMeal} />
        </View>

        <Text style={styles.h2}>Orders Analytics</Text>
        <Text style={styles.body}>
          Total {report.ordersAnalytics.totalOrders} · Completed{' '}
          {report.ordersAnalytics.completed} · Pending {report.ordersAnalytics.pending} ·
          Cancelled {report.ordersAnalytics.cancelled} · Failed {report.ordersAnalytics.failed} ·
          Active {report.ordersAnalytics.active} · Split completion{' '}
          {(report.ordersAnalytics.splitCompletionRate * 100).toFixed(1)}%
        </Text>

        <Text style={styles.h2}>Payment Analytics</Text>
        <Text style={styles.body}>
          Successful {report.paymentAnalytics.successful} · Failed{' '}
          {report.paymentAnalytics.failed} · Pending {report.paymentAnalytics.pending} · Refunds{' '}
          {report.paymentAnalytics.refunds} · Revenue {money(report.paymentAnalytics.revenue)} ·
          Success rate {(report.paymentAnalytics.successRate * 100).toFixed(1)}%
        </Text>

        <View style={styles.alert}>
          <Text style={styles.alertTitle}>Payment Exception Report</Text>
          <Text style={styles.alertSub}>
            Paid orders with operational or refund issues ({report.paymentExceptions.length})
          </Text>
          {report.paymentExceptions.length === 0 ? (
            <Text style={styles.body}>None in this period.</Text>
          ) : (
            report.paymentExceptions.map((x) => (
              <View key={x.orderId + x.paymentTransactionId} style={styles.exception}>
                <Text style={styles.exceptionTitle}>
                  {x.orderId} · {money(x.amount)}
                </Text>
                <Text style={styles.body}>
                  {x.customerName} · {x.restaurant} · {x.meal}
                </Text>
                <Text style={styles.body}>
                  {x.problem} · pay={x.paymentStatus} · refund={x.refundStatus}{' '}
                  {money(x.refundAmount)}
                </Text>
                <Text style={styles.meta}>
                  tx={x.paymentTransactionId || 'n/a'} · {x.location} ·{' '}
                  {new Date(x.orderTimeMs).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.h2}>Customer Issues</Text>
        {report.customerIssues.map((i) => (
          <Text key={i.label} style={styles.body}>
            • {i.label}: {i.count} — {i.trendNote}
          </Text>
        ))}

        <Text style={styles.h2}>AI Conversation Summary</Text>
        {report.conversationSummary.map((c) => (
          <Text key={c.theme} style={styles.body}>
            • {c.count} × {c.theme}
          </Text>
        ))}

        <Text style={styles.h2}>High Priority Conversations</Text>
        {report.highPriorityConversations.map((h, idx) => (
          <Text key={`${h.userName}-${idx}`} style={styles.body}>
            • [{h.priority}] {h.userName}: {h.summary} → {h.recommendedAction}
          </Text>
        ))}

        <Text style={styles.h2}>AI Insights</Text>
        {report.insights.map((i) => (
          <Text key={i} style={styles.body}>
            • {i}
          </Text>
        ))}

        <Text style={styles.h2}>AI Recommendations</Text>
        {report.recommendations.map((r) => (
          <Text key={r} style={styles.body}>
            → {r}
          </Text>
        ))}

        <Text style={styles.h2}>Full export preview</Text>
        <Text style={styles.mono}>{renderEmoAiReportPlainText(report).slice(0, 2500)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 48 },
  badgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  badge: {
    backgroundColor: COLORS.primary,
    color: '#fff',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
  },
  period: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 10 },
  meta: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 8 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '700' },
  h2: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
  },
  body: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    width: '48%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  kpiLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  kpiValue: { fontSize: 15, fontWeight: '900', color: COLORS.text, marginTop: 2 },
  alert: {
    marginTop: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 2,
    borderColor: COLORS.error,
    borderRadius: 14,
    padding: 12,
  },
  alertTitle: { color: COLORS.error, fontWeight: '900', fontSize: 15 },
  alertSub: { color: COLORS.textMuted, fontSize: 12, marginBottom: 8 },
  exception: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  exceptionTitle: { fontWeight: '800', color: COLORS.text },
  mono: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.textMuted,
    backgroundColor: COLORS.card,
    padding: 10,
    borderRadius: 10,
  },
  error: { color: COLORS.error, padding: 16 },
});
