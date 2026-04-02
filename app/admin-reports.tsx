import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as C } from '@/constants/adminTheme';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ReportRow = {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  orderId: string | null;
  reason: string | null;
  context: string | null;
  message: string | null;
  createdAtLabel: string;
  adminResolution: string | null;
};

function formatTime(v: unknown): string {
  if (v instanceof Timestamp) {
    return v.toDate().toLocaleString();
  }
  return '—';
}

export default function AdminReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const isAdmin = isAdminUser(user);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc'),
        limit(80),
      );
      const snap = await getDocs(q);
      const list: ReportRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          reporterId: typeof data?.reporterId === 'string' ? data.reporterId : '—',
          reportedUserId:
            typeof data?.reportedUserId === 'string' ? data.reportedUserId : null,
          orderId: typeof data?.orderId === 'string' ? data.orderId : null,
          reason: typeof data?.reason === 'string' ? data.reason : null,
          context: typeof data?.context === 'string' ? data.context : null,
          message: typeof data?.message === 'string' ? data.message : null,
          createdAtLabel: formatTime(data?.createdAt),
          adminResolution:
            typeof data?.adminResolution === 'string' ? data.adminResolution : null,
        };
      });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (user && !isAdminUser(user)) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  useEffect(() => {
    if (isAdmin) {
      void load();
    } else {
      setLoading(false);
    }
  }, [isAdmin, load]);

  const markIgnored = (reportId: string) => {
    Alert.alert('Ignore report', 'Mark this report as reviewed with no action?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ignore',
        onPress: async () => {
          setActingId(reportId);
          try {
            await updateDoc(doc(db, 'reports', reportId), {
              adminResolution: 'ignored',
              adminResolvedAt: serverTimestamp(),
            });
            await load();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
          } finally {
            setActingId(null);
          }
        },
      },
    ]);
  };

  const banReportedUser = (reportId: string, reportedUserId: string) => {
    Alert.alert(
      'Ban reported user',
      `Ban user ${reportedUserId.slice(0, 8)}… and close this report?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            setActingId(reportId);
            try {
              await updateDoc(doc(db, 'users', reportedUserId), {
                banned: true,
              });
              await updateDoc(doc(db, 'reports', reportId), {
                adminResolution: 'banned_reported_user',
                adminResolvedAt: serverTimestamp(),
              });
              await load();
              Alert.alert('Done', 'User banned and report updated.');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Sign in to continue.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Access denied.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
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
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>User reports</Text>
        <Text style={styles.sub}>
          Review UGC and safety reports. Ignore when no policy violation; ban
          when the reported account should be restricted.
        </Text>

        {loading && rows.length === 0 ? (
          <ActivityIndicator size="large" style={{ marginTop: 24 }} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {rows.map((r) => {
          const resolved = !!r.adminResolution;
          return (
            <View
              key={r.id}
              style={[styles.card, resolved && styles.cardResolved]}
            >
              <TouchableOpacity
                onPress={() =>
                  r.reportedUserId
                    ? router.push(`/admin-user/${r.reportedUserId}` as never)
                    : undefined
                }
                disabled={!r.reportedUserId}
                activeOpacity={0.85}
              >
                <Text style={styles.cardTime}>{r.createdAtLabel}</Text>
                <Text style={styles.cardLine}>
                  <Text style={styles.cardLabel}>Reporter: </Text>
                  {r.reporterId}
                </Text>
                {r.reportedUserId ? (
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Reported user: </Text>
                    <Text style={styles.linkInline}>{r.reportedUserId}</Text>
                    <Text style={styles.hint}> (tap for profile)</Text>
                  </Text>
                ) : null}
                {r.orderId ? (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/admin-order/${r.orderId}` as never)
                    }
                  >
                    <Text style={styles.cardLine}>
                      <Text style={styles.cardLabel}>Order: </Text>
                      <Text style={styles.linkInline}>{r.orderId}</Text>
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {r.reason ? (
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Reason: </Text>
                    {r.reason}
                  </Text>
                ) : null}
                {r.context ? (
                  <Text style={styles.cardLine}>{r.context}</Text>
                ) : null}
                {r.message ? (
                  <Text style={styles.cardPreview} numberOfLines={6}>
                    {r.message}
                  </Text>
                ) : null}
                {r.adminResolution ? (
                  <Text style={styles.resolutionBadge}>
                    {r.adminResolution.replace(/_/g, ' ')}
                  </Text>
                ) : null}
              </TouchableOpacity>

              {!resolved ? (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.ignoreBtn]}
                    disabled={actingId === r.id}
                    onPress={() => markIgnored(r.id)}
                  >
                    {actingId === r.id ? (
                      <ActivityIndicator color={C.text} />
                    ) : (
                      <Text style={styles.ignoreBtnText}>Ignore</Text>
                    )}
                  </TouchableOpacity>
                  {r.reportedUserId ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.banBtn]}
                      disabled={actingId === r.id}
                      onPress={() =>
                        banReportedUser(r.id, r.reportedUserId as string)
                      }
                    >
                      <Text style={styles.banBtnText}>Ban user</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.idTiny}>Doc: {r.id}</Text>
            </View>
          );
        })}

        {!loading && rows.length === 0 && !error ? (
          <Text style={styles.muted}>No reports yet.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  backBtn: { marginBottom: 8 },
  backBtnText: { fontSize: 16, color: C.accentBlue, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  sub: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 20,
  },
  muted: { fontSize: 15, color: C.textMuted },
  error: { color: C.error, marginVertical: 12 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardResolved: { opacity: 0.85 },
  cardTime: { fontSize: 12, color: C.textMuted, marginBottom: 8 },
  cardLine: { fontSize: 14, color: C.text, marginBottom: 4 },
  cardLabel: { fontWeight: '700', color: C.text },
  linkInline: { color: C.accentBlue, fontWeight: '600' },
  hint: { fontSize: 12, color: C.textMuted },
  cardPreview: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  resolutionBadge: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: C.successText,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  ignoreBtn: { backgroundColor: C.border },
  ignoreBtnText: { fontWeight: '700', color: C.text },
  banBtn: { backgroundColor: C.dangerBg },
  banBtnText: { fontWeight: '700', color: C.error },
  idTiny: { fontSize: 11, color: C.textMuted, marginTop: 8 },
});
