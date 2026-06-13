import { AdminHeader } from '../../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../../constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '../../../../constants/adminTheme';
import { theme } from '../../../../constants/theme';
import { adminError, adminLog } from '../../../../lib/admin/adminDebug';
import { formatFirestoreTime, reportDetailText } from '../../../../lib/admin/orderHelpers';
import { db } from '../../../../services/firebase';
import {
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { systemConfirm } from '../../../../components/SystemDialogHost';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { resolveFoodShareReport } from '@/services/adminModeration';
import { getUserFriendlyError } from '../../../../utils/errorHandler';
import { showError, showSuccess } from '../../../../utils/toast';

export default function AdminReportDetailScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const reportId = typeof rawId === 'string' ? rawId.trim() : '';

  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      return;
    }
    adminLog('report-detail', 'subscribe report doc', { reportId });
    const u = onSnapshot(
      doc(db, 'reports', reportId),
      (snap) => {
        adminLog('report-detail', 'report snapshot', {
          reportId,
          exists: snap.exists(),
        });
        setReport(snap.exists() ? snap.data() ?? {} : {});
        setLoading(false);
      },
      (err) => {
        adminError('report-detail', 'report listener error', err);
        setLoading(false);
      },
    );
    return () => u();
  }, [reportId]);

  const contentIdRaw =
    report && typeof report.contentId === 'string' ? report.contentId.trim() : null;
  const reportedUserId =
    report && typeof report.reportedUserId === 'string'
      ? report.reportedUserId
      : null;
  const matchId =
    report && typeof report.matchId === 'string'
      ? report.matchId
      : contentIdRaw?.startsWith('foodShareMatch:')
        ? contentIdRaw.slice('foodShareMatch:'.length)
        : null;
  const reportStatus =
    report && typeof report.status === 'string' ? report.status : null;
  const resolved =
    report && typeof report.adminResolution === 'string'
      ? report.adminResolution
      : reportStatus && reportStatus !== 'open'
        ? reportStatus
        : null;

  useEffect(() => {
    if (!reportedUserId) {
      setUserInfo(null);
      return;
    }
    adminLog('report-detail', 'subscribe reported user doc', { reportedUserId });
    const u = onSnapshot(
      doc(db, 'users', reportedUserId),
      (snap) => {
        adminLog('report-detail', 'reported user snapshot', { exists: snap.exists() });
        setUserInfo(snap.exists() ? snap.data() ?? {} : {});
      },
      (err) => adminError('report-detail', 'reported user listener error', err),
    );
    return () => u();
  }, [reportedUserId]);

  const markIgnored = () => resolveReport('dismissed', 'Dismiss report');
  const warnUser = () => resolveReport('warned', 'Warn user');
  const suspendUser = () => resolveReport('suspended', 'Suspend user');
  const banUser = () => resolveReport('banned', 'Ban user');

  const resolveReport = (status: 'dismissed' | 'warned' | 'suspended' | 'banned', title: string) => {
    if (!reportId) return;
    void (async () => {
      const ok = await systemConfirm({
        title,
        message: `Apply "${status}" to this report?`,
        confirmLabel: title,
        destructive: status === 'banned' || status === 'suspended',
      });
      if (!ok) return;
      setActing(true);
      try {
        await resolveFoodShareReport({
          reportId,
          status,
          reportedUserId,
          matchId,
        });
        showSuccess(`Report ${status}.`);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  if (!reportId) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.muted}>Invalid report</Text>
      </SafeAreaView>
    );
  }

  if (loading && !report) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!report || Object.keys(report).length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <AdminHeader title="Report" fallbackRoute={adminRoutes.reports} />
        <Text style={styles.muted}>Not found</Text>
      </SafeAreaView>
    );
  }

  const detail = report ? reportDetailText(report as Record<string, unknown>) : null;
  const legacyOrderId =
    report && typeof report.orderId === 'string' ? report.orderId.trim() : null;
  const orderForLink =
    legacyOrderId ||
    (contentIdRaw?.startsWith('order:') ? contentIdRaw.slice(6) : null);

  const uEmail =
    userInfo && typeof userInfo.email === 'string' ? userInfo.email : null;
  const uName =
    userInfo && typeof userInfo.displayName === 'string'
      ? userInfo.displayName
      : null;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Report detail" fallbackRoute={adminRoutes.reports} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.k}>Created</Text>
          <Text style={styles.v}>{formatFirestoreTime(report.createdAt)}</Text>
          <Text style={styles.k}>Reason</Text>
          <Text style={styles.v}>
            {typeof report.reason === 'string' ? report.reason : '—'}
          </Text>
          <Text style={styles.k}>Reporter</Text>
          <Text style={styles.v}>
            {typeof report.reporterId === 'string' ? report.reporterId : '—'}
          </Text>
          <Text style={styles.k}>Reported user</Text>
          {reportedUserId ? (
            <TouchableOpacity
              onPress={() =>
                router.push(adminRoutes.user(reportedUserId) as never)
              }
            >
              <Text style={[styles.v, styles.link]}>{reportedUserId}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.v}>—</Text>
          )}
          {contentIdRaw ? (
            <>
              <Text style={styles.k}>Content ID</Text>
              <Text style={[styles.v, styles.mono]}>{contentIdRaw}</Text>
            </>
          ) : null}
          {matchId ? (
            <>
              <Text style={styles.k}>Meal share match</Text>
              <TouchableOpacity
                onPress={() =>
                  router.push(USER_ROUTES.foodShareMatch(matchId) as never)
                }
              >
                <Text style={[styles.v, styles.link]}>{matchId}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {orderForLink ? (
            <>
              <Text style={styles.k}>Order</Text>
              <TouchableOpacity
                onPress={() =>
                  router.push(adminRoutes.order(orderForLink) as never)
                }
              >
                <Text style={[styles.v, styles.link]}>{orderForLink}</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {detail ? (
            <>
              <Text style={styles.k}>Details</Text>
              <Text style={styles.detail}>{detail}</Text>
            </>
          ) : null}
          {resolved ? (
            <Text style={styles.resolved}>Resolution: {resolved}</Text>
          ) : null}
        </View>

        {reportedUserId ? (
          <View style={styles.card}>
            <Text style={styles.section}>Reported user (Firestore)</Text>
            <Text style={styles.v}>{uName ?? '—'}</Text>
            <Text style={styles.meta}>{uEmail ?? '—'}</Text>
          </View>
        ) : null}

        {!resolved ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.ignore]}
              disabled={acting}
              onPress={markIgnored}
            >
              <Text style={styles.ignoreT}>Dismiss</Text>
            </TouchableOpacity>
            {reportedUserId ? (
              <>
                <TouchableOpacity
                  style={[styles.btn, styles.warn]}
                  disabled={acting}
                  onPress={warnUser}
                >
                  <Text style={styles.warnT}>Warn user</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.suspend]}
                  disabled={acting}
                  onPress={suspendUser}
                >
                  <Text style={styles.suspendT}>Suspend user</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.ban]}
                  disabled={acting}
                  onPress={banUser}
                >
                  <Text style={styles.banT}>Ban user</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 14, padding: theme.spacing.md },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 8 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  link: { color: COLORS.primary, fontWeight: '700' },
  detail: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  resolved: {
    marginTop: 12,
    fontWeight: '700',
    color: COLORS.successText,
  },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  meta: { fontSize: 14, color: COLORS.textMuted },
  muted: { color: COLORS.textMuted, padding: 16 },
  actions: { gap: 12 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ignore: { backgroundColor: COLORS.border },
  ignoreT: { fontWeight: '800', color: COLORS.text },
  warn: { backgroundColor: '#FEF3C7' },
  warnT: { fontWeight: '800', color: '#92400E' },
  suspend: { backgroundColor: '#FFEDD5' },
  suspendT: { fontWeight: '800', color: '#C2410C' },
  ban: { backgroundColor: COLORS.dangerBg },
  banT: { fontWeight: '800', color: COLORS.error },
});
