import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function orderCreatorId(data: Record<string, unknown>): string {
  const v =
    data.createdBy ?? data.hostId ?? data.creatorId ?? data.userId ?? '';
  return typeof v === 'string' ? v : '';
}

function formatTs(v: unknown): string {
  if (v && typeof v === 'object' && 'toMillis' in v) {
    const fn = (v as Timestamp).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(v);
      return ms ? new Date(ms).toLocaleString() : '—';
    }
  }
  return '—';
}

type JoinRow = {
  orderId: string;
  title: string;
  status: string;
  role: 'host' | 'participant';
  createdAt: string;
};

type ReportMini = {
  id: string;
  role: 'reported' | 'reporter';
  reason: string | null;
  createdAt: string;
  adminResolution: string | null;
};

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { userId: rawId } = useLocalSearchParams<{ userId: string }>();
  const userId = typeof rawId === 'string' ? rawId.trim() : '';
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [joinHistory, setJoinHistory] = useState<JoinRow[]>([]);
  const [reportsAbout, setReportsAbout] = useState<ReportMini[]>([]);
  const [reportsBy, setReportsBy] = useState<ReportMini[]>([]);
  const [totalOrderTouches, setTotalOrderTouches] = useState(0);

  const load = useCallback(async () => {
    if (!userId || !isAdminUser(user)) return;
    setError(null);
    try {
      const userRef = doc(db, 'users', userId);
      const [userSnap, ordersSnap, repAboutSnap, repBySnap] = await Promise.all([
        getDoc(userRef),
        getDocs(collection(db, 'orders')),
        getDocs(
          query(
            collection(db, 'reports'),
            where('reportedUserId', '==', userId),
          ),
        ),
        getDocs(
          query(collection(db, 'reports'), where('reporterId', '==', userId)),
        ),
      ]);

      setProfile(userSnap.exists() ? userSnap.data() ?? {} : {});

      const joins: JoinRow[] = [];
      ordersSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const creator = orderCreatorId(data);
        const parts = Array.isArray(data.participants)
          ? data.participants.filter((x): x is string => typeof x === 'string')
          : [];
        const isHost = creator === userId;
        const isParticipant = parts.includes(userId);
        if (!isHost && !isParticipant) return;
        const food =
          typeof data.foodName === 'string'
            ? data.foodName
            : typeof data.restaurantName === 'string'
              ? data.restaurantName
              : d.id.slice(0, 8);
        joins.push({
          orderId: d.id,
          title: food,
          status: typeof data.status === 'string' ? data.status : '—',
          role: isHost ? 'host' : 'participant',
          createdAt: formatTs(data.createdAt),
        });
      });
      joins.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setJoinHistory(joins);
      setTotalOrderTouches(joins.length);

      const mapReport = (
        d: { id: string; data: () => Record<string, unknown> },
        role: 'reported' | 'reporter',
      ): ReportMini => {
        const data = d.data();
        return {
          id: d.id,
          role,
          reason: typeof data.reason === 'string' ? data.reason : null,
          createdAt: formatTs(data.createdAt),
          adminResolution:
            typeof data.adminResolution === 'string'
              ? data.adminResolution
              : null,
        };
      };
      setReportsAbout(repAboutSnap.docs.map((x) => mapReport(x, 'reported')));
      setReportsBy(repBySnap.docs.map((x) => mapReport(x, 'reporter')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, user]);

  useEffect(() => {
    if (!user) return;
    if (!isAdminUser(user)) {
      router.replace('/(tabs)');
      return;
    }
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, userId, load, router]);

  if (!user || !isAdminUser(user)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.muted}>Invalid user id</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const email = typeof profile?.email === 'string' ? profile.email : null;
  const displayName =
    typeof profile?.displayName === 'string' ? profile.displayName : '—';
  const banned = profile?.banned === true;
  const createdAt = formatTs(profile?.createdAt);
  const phone =
    typeof profile?.phoneNumber === 'string' ? profile.phoneNumber : null;

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
            tintColor={COLORS.primary}
          />
        }
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Text style={styles.link}>← Users</Text>
        </TouchableOpacity>
        <Text style={styles.title}>User detail</Text>
        <Text style={styles.mono}>{userId}</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.k}>Display name</Text>
          <Text style={styles.v}>{displayName}</Text>
          <Text style={styles.k}>Email</Text>
          <Text style={styles.v}>{email ?? '—'}</Text>
          {phone ? (
            <>
              <Text style={styles.k}>Phone</Text>
              <Text style={styles.v}>{phone}</Text>
            </>
          ) : null}
          <Text style={styles.k}>Created</Text>
          <Text style={styles.v}>{createdAt}</Text>
          <Text style={styles.k}>Banned</Text>
          <Text style={styles.v}>{banned ? 'Yes' : 'No'}</Text>
          <Text style={styles.k}>Total order involvement</Text>
          <Text style={styles.v}>{totalOrderTouches}</Text>
        </View>

        <Text style={styles.section}>Join history</Text>
        {joinHistory.length === 0 ? (
          <Text style={styles.muted}>No orders found.</Text>
        ) : (
          joinHistory.map((row) => (
            <TouchableOpacity
              key={row.orderId}
              style={styles.card}
              onPress={() =>
                router.push(`/admin-order/${row.orderId}` as never)
              }
              activeOpacity={0.85}
            >
              <Text style={styles.orderTitle}>{row.title}</Text>
              <Text style={styles.meta}>
                {row.role === 'host' ? 'Host' : 'Participant'} · {row.status}
              </Text>
              <Text style={styles.meta}>{row.createdAt}</Text>
              <Text style={styles.tap}>Order {row.orderId.slice(0, 10)}… →</Text>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.section}>Reports about this user</Text>
        {reportsAbout.length === 0 ? (
          <Text style={styles.muted}>None</Text>
        ) : (
          reportsAbout.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.meta}>{r.createdAt}</Text>
              <Text style={styles.v}>{r.reason ?? '—'}</Text>
              {r.adminResolution ? (
                <Text style={styles.resolved}>Resolution: {r.adminResolution}</Text>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.section}>Reports filed by this user</Text>
        {reportsBy.length === 0 ? (
          <Text style={styles.muted}>None</Text>
        ) : (
          reportsBy.map((r) => (
            <View key={r.id} style={styles.card}>
              <Text style={styles.meta}>{r.createdAt}</Text>
              <Text style={styles.v}>{r.reason ?? '—'}</Text>
              {r.adminResolution ? (
                <Text style={styles.resolved}>Resolution: {r.adminResolution}</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: theme.spacing.md, paddingBottom: 40 },
  backRow: { marginBottom: 8 },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  mono: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  section: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 10,
  },
  card: {
    ...adminCardShell,
    marginBottom: 10,
  },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 10 },
  orderTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  tap: { fontSize: 13, color: COLORS.primary, marginTop: 8, fontWeight: '600' },
  muted: { fontSize: 14, color: COLORS.textMuted },
  errorBox: {
    backgroundColor: COLORS.dangerBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: { color: COLORS.error },
  resolved: { fontSize: 13, color: COLORS.successText, marginTop: 6 },
});
