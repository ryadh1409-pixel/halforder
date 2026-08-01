/**
 * Admin Referral Dashboard
 * Shows all customer + driver referrals: who invited whom, status, date, reward.
 */
import { adminColors as COLORS } from '@/constants/adminTheme';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerReferral = {
  id: string;
  inviterId: string;
  inviterName: string | null;
  invitedUserId: string;
  inviteeName: string | null;
  orderId: string | null;
  rewardAmount: number;
  status: string;
  createdAtMs: number | null;
};

type DriverReferral = {
  driverId: string;
  driverName: string | null;
  referralCode: string;
  totalSignups: number;
  successful: number;
  pending: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortId(uid: string): string {
  return uid.slice(0, 8).toUpperCase();
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusColor(s: string): string {
  if (s === 'completed' || s === 'reward_issued' || s === 'approved' || s === 'paid') return '#22C55E';
  if (s === 'pending' || s === 'registered' || s === 'invited') return '#F59E0B';
  if (s === 'cancelled') return '#EF4444';
  return '#6B7280';
}

function statusLabel(s: string): string {
  switch (s) {
    case 'reward_issued': return 'Reward Issued';
    case 'completed_first_order': return 'First Order Done';
    case 'registered': return 'Registered';
    case 'invited': return 'Invited';
    case 'approved': return 'Approved';
    case 'paid': return 'Paid';
    case 'pending': return 'Pending';
    case 'cancelled': return 'Cancelled';
    default: return s || 'Unknown';
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchUserName(uid: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.has(uid)) return cache.get(uid)!;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const d = snap.data() as Record<string, unknown>;
      const name =
        (d.displayName as string) ||
        (d.name as string) ||
        (d.fullName as string) ||
        null;
      if (name) cache.set(uid, name);
      return name;
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminReferralDashboard() {
  const router = useRouter();

  const [customerReferrals, setCustomerReferrals] = useState<CustomerReferral[]>([]);
  const [driverReferrals, setDriverReferrals] = useState<DriverReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'customer' | 'driver'>('customer');

  const nameCache = React.useRef(new Map<string, string>());

  const loadData = React.useCallback(async () => {
    try {
      // ── Customer referrals (friendReferrals collection) ──────────────
      const frSnap = await getDocs(
        query(
          collection(db, 'friendReferrals'),
          orderBy('createdAt', 'desc'),
          limit(100),
        ),
      );

      const customerRows: CustomerReferral[] = await Promise.all(
        frSnap.docs.map(async (d) => {
          const data = d.data() as Record<string, unknown>;
          const inviterId = (data.inviterId as string) || '';
          const friendUid = (data.friendUid as string) || (data.invitedUserId as string) || '';
          const [inviterName, inviteeName] = await Promise.all([
            inviterId ? fetchUserName(inviterId, nameCache.current) : null,
            friendUid ? fetchUserName(friendUid, nameCache.current) : null,
          ]);
          return {
            id: d.id,
            inviterId,
            inviterName,
            invitedUserId: friendUid,
            inviteeName,
            orderId: (data.orderId as string) || null,
            rewardAmount:
              typeof data.rewardAmount === 'number' ? data.rewardAmount : 2,
            status: (data.status as string) || 'invited',
            createdAtMs: safeToMillis(data.createdAt),
          };
        }),
      );
      setCustomerReferrals(customerRows);

      // ── Driver referrals (driverReferralDriverStats) ──────────────────
      const drSnap = await getDocs(
        query(collection(db, 'driverReferralDriverStats'), limit(100)),
      );

      const driverRows: DriverReferral[] = await Promise.all(
        drSnap.docs.map(async (d) => {
          const data = d.data() as Record<string, unknown>;
          const driverId = d.id;
          const driverName = await fetchUserName(driverId, nameCache.current);
          return {
            driverId,
            driverName,
            referralCode: (data.referralCode as string) || `DRV${driverId.slice(0, 10).toUpperCase()}`,
            totalSignups: typeof data.totalSignups === 'number' ? data.totalSignups : 0,
            successful: typeof data.successful === 'number' ? data.successful : 0,
            pending: typeof data.pending === 'number' ? data.pending : 0,
          };
        }),
      );
      setDriverReferrals(driverRows.sort((a, b) => b.totalSignups - a.totalSignups));
    } catch (e) {
      console.warn('[AdminReferralDashboard]', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalCustomer = customerReferrals.length;
  const successfulCustomer = customerReferrals.filter(
    (r) => r.status === 'reward_issued' || r.status === 'completed_first_order',
  ).length;
  const pendingCustomer = customerReferrals.filter(
    (r) => r.status === 'invited' || r.status === 'registered',
  ).length;

  const totalDriverSignups = driverReferrals.reduce((s, r) => s + r.totalSignups, 0);
  const totalDriverSuccessful = driverReferrals.reduce((s, r) => s + r.successful, 0);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Referral Dashboard</Text>
        <Pressable onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Tab bar */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'customer' && styles.tabActive]}
          onPress={() => setTab('customer')}
        >
          <Text style={[styles.tabText, tab === 'customer' && styles.tabTextActive]}>
            Customer ({totalCustomer})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'driver' && styles.tabActive]}
          onPress={() => setTab('driver')}
        >
          <Text style={[styles.tabText, tab === 'driver' && styles.tabTextActive]}>
            Driver ({driverReferrals.length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading referrals…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {tab === 'customer' ? (
            <>
              {/* Customer stats */}
              <View style={styles.statsRow}>
                <StatCard label="Total" value={totalCustomer} color="#7C3AED" />
                <StatCard label="Successful" value={successfulCustomer} color="#22C55E" />
                <StatCard label="Pending" value={pendingCustomer} color="#F59E0B" />
              </View>

              {/* Customer rows */}
              {customerReferrals.length === 0 ? (
                <EmptyState message="No customer referrals yet." />
              ) : (
                customerReferrals.map((ref) => (
                  <View key={ref.id} style={styles.card}>
                    {/* Inviter */}
                    <View style={styles.cardRow}>
                      <Ionicons name="person-circle-outline" size={16} color="#7C3AED" />
                      <View style={styles.cardCol}>
                        <Text style={styles.cardLabel}>Inviter</Text>
                        <Text style={styles.cardValue}>
                          {ref.inviterName ?? shortId(ref.inviterId)}
                        </Text>
                        <Text style={styles.cardSub}>{shortId(ref.inviterId)}</Text>
                      </View>
                    </View>

                    {/* Arrow */}
                    <View style={styles.arrow}>
                      <Ionicons name="arrow-down" size={14} color="#4B5563" />
                    </View>

                    {/* Invitee */}
                    <View style={styles.cardRow}>
                      <Ionicons name="person-add-outline" size={16} color="#22C55E" />
                      <View style={styles.cardCol}>
                        <Text style={styles.cardLabel}>Invited</Text>
                        <Text style={styles.cardValue}>
                          {ref.inviteeName ?? (ref.invitedUserId ? shortId(ref.invitedUserId) : '—')}
                        </Text>
                        {ref.invitedUserId ? (
                          <Text style={styles.cardSub}>{shortId(ref.invitedUserId)}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Meta row */}
                    <View style={styles.metaRow}>
                      {ref.orderId ? (
                        <Pressable
                          onPress={() =>
                            router.push(`/(tabs)/admin/order/${ref.orderId}` as never)
                          }
                          style={styles.metaChip}
                        >
                          <Ionicons name="receipt-outline" size={11} color={COLORS.primary} />
                          <Text style={styles.metaChipText}>
                            #{ref.orderId.slice(-6).toUpperCase()}
                          </Text>
                        </Pressable>
                      ) : null}

                      <View style={[styles.statusChip, { borderColor: statusColor(ref.status) }]}>
                        <View
                          style={[styles.statusDot, { backgroundColor: statusColor(ref.status) }]}
                        />
                        <Text style={[styles.statusText, { color: statusColor(ref.status) }]}>
                          {statusLabel(ref.status)}
                        </Text>
                      </View>

                      {ref.rewardAmount > 0 ? (
                        <View style={styles.rewardChip}>
                          <Text style={styles.rewardText}>+${ref.rewardAmount.toFixed(2)}</Text>
                        </View>
                      ) : null}

                      <Text style={styles.dateText}>{formatDate(ref.createdAtMs)}</Text>
                    </View>
                  </View>
                ))
              )}
            </>
          ) : (
            <>
              {/* Driver stats */}
              <View style={styles.statsRow}>
                <StatCard label="Active Drivers" value={driverReferrals.length} color="#7C3AED" />
                <StatCard label="Total Signups" value={totalDriverSignups} color="#3B82F6" />
                <StatCard label="Successful" value={totalDriverSuccessful} color="#22C55E" />
              </View>

              {/* Driver rows */}
              {driverReferrals.length === 0 ? (
                <EmptyState message="No driver referrals yet." />
              ) : (
                driverReferrals.map((dr) => (
                  <View key={dr.driverId} style={styles.card}>
                    <View style={styles.driverHeader}>
                      <View>
                        <Text style={styles.cardValue}>
                          {dr.driverName ?? shortId(dr.driverId)}
                        </Text>
                        <Text style={styles.cardSub}>ID: {shortId(dr.driverId)}</Text>
                      </View>
                      <View style={styles.codeChip}>
                        <Text style={styles.codeText}>{dr.referralCode}</Text>
                      </View>
                    </View>

                    <View style={styles.driverStats}>
                      <DriverStat label="Total" value={dr.totalSignups} color="#3B82F6" />
                      <DriverStat label="Successful" value={dr.successful} color="#22C55E" />
                      <DriverStat label="Pending" value={dr.pending} color="#F59E0B" />
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderColor: `${color}40` }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DriverStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.driverStatItem}>
      <Text style={[styles.driverStatValue, { color }]}>{value}</Text>
      <Text style={styles.driverStatLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={40} color="#374151" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090F' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0D0D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F2E',
  },
  backBtn: { marginRight: 12, padding: 2 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  refreshBtn: { padding: 4 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#0D0D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F2E',
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  tabTextActive: { color: COLORS.primary },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#4B5563', fontSize: 14, fontWeight: '600' },

  scroll: { flex: 1 },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0D0D1A',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  card: {
    backgroundColor: '#0D0D1A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F1F2E',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    gap: 8,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCol: { flex: 1, gap: 1 },
  cardLabel: { fontSize: 10, color: '#4B5563', fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  cardValue: { fontSize: 14, fontWeight: '700', color: '#E2E8F0' },
  cardSub: { fontSize: 11, color: '#4B5563', fontFamily: 'monospace' },

  arrow: { alignItems: 'center', paddingVertical: 2 },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F1F2E',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A2E',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaChipText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rewardChip: {
    backgroundColor: '#14532D',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rewardText: { fontSize: 11, color: '#22C55E', fontWeight: '800' },
  dateText: { fontSize: 11, color: '#4B5563', marginLeft: 'auto' },

  // Driver
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  codeChip: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#3B82F640',
  },
  codeText: { fontSize: 12, fontWeight: '800', color: '#3B82F6', fontFamily: 'monospace' },
  driverStats: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F1F2E',
    marginTop: 8,
    paddingTop: 10,
  },
  driverStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  driverStatValue: { fontSize: 18, fontWeight: '900' },
  driverStatLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#4B5563', fontSize: 14, fontWeight: '600' },
});
