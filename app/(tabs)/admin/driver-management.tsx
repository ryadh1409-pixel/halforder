import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { DEFAULT_DRIVER_PAYOUT_PERCENT } from '@/lib/driverEarnings';
import {
  setDriverAdminSuspended,
  subscribeAdminDrivers,
  type AdminDriverRow,
} from '@/services/adminDriverManagement';
import {
  computeDriverReferralCode,
  emptyAdminDriverReferralStats,
  subscribeAdminDriverReferralStats,
  subscribeAdminDriverReferredUsers,
  type AdminDriverReferralStats,
  type AdminDriverReferredUser,
} from '@/services/adminDriverReferralTracking';
import { auth, db } from '@/services/firebase';
import {
  saveDriverPayoutPercent,
  subscribeDriverPayoutPercent,
} from '@/services/driverPayoutSettings';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Image } from 'expo-image';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatRegistrationDate(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function DriverReferralStatsSection({
  stats,
}: {
  stats: AdminDriverReferralStats;
}) {
  return (
    <View style={styles.referralSection}>
      <Text style={styles.referralTitle}>Referral Statistics</Text>
      <Text style={styles.referralLabel}>Referral Code</Text>
      <Text style={styles.referralCode}>{stats.referralCode || '—'}</Text>
      <View style={styles.referralStatsRow}>
        <View style={styles.referralStatCell}>
          <Text style={styles.referralStatLabel}>Total Signups</Text>
          <Text style={styles.referralStatValue}>{stats.totalSignups}</Text>
        </View>
        <View style={styles.referralStatCell}>
          <Text style={styles.referralStatLabel}>Successful</Text>
          <Text style={styles.referralStatValue}>{stats.successful}</Text>
        </View>
        <View style={styles.referralStatCell}>
          <Text style={styles.referralStatLabel}>Pending</Text>
          <Text style={styles.referralStatValue}>{stats.pending}</Text>
        </View>
      </View>
    </View>
  );
}

function DriverReferredUsersList({ driverId }: { driverId: string }) {
  const [rows, setRows] = useState<AdminDriverReferredUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return subscribeAdminDriverReferredUsers(driverId, (next) => {
      setRows(next);
      setLoading(false);
    });
  }, [driverId]);

  if (loading) {
    return (
      <View style={styles.referredLoading}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return <Text style={styles.referredEmpty}>No referred users yet.</Text>;
  }

  return (
    <View style={styles.referredList}>
      <Text style={styles.referredHeading}>Referred Users</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.referredCard}>
          <Text style={styles.referredName} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.referredMeta} numberOfLines={1}>
            {row.email ?? 'No email'}
          </Text>
          <Text style={styles.referredMeta}>
            Registered {formatRegistrationDate(row.registrationDateMs)}
          </Text>
          <Text style={styles.referredStatus}>{row.accountStatus}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DriverManagementScreen() {
  const [rows, setRows] = useState<AdminDriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [payoutPercentDraft, setPayoutPercentDraft] = useState(
    String(DEFAULT_DRIVER_PAYOUT_PERCENT),
  );
  const [savingPayout, setSavingPayout] = useState(false);
  const [referralCounters, setReferralCounters] = useState<
    Record<string, Omit<AdminDriverReferralStats, 'referralCode'>>
  >({});
  const [referralCodes, setReferralCodes] = useState<Record<string, string>>(
    {},
  );
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAdminDrivers((next) => {
      setRows(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    return subscribeAdminDriverReferralStats(setReferralCounters);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        rows.map(async (row) => {
          try {
            const code = await computeDriverReferralCode(row.id);
            return [row.id, code] as const;
          } catch {
            return [row.id, ''] as const;
          }
        }),
      );
      if (cancelled) return;
      setReferralCodes((prev) => {
        const next = { ...prev };
        entries.forEach(([id, code]) => {
          if (code) next[id] = code;
        });
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  useEffect(() => {
    return subscribeDriverPayoutPercent((percent) => {
      setPayoutPercentDraft(String(percent));
    });
  }, []);

  /** Ensure Firestore always has a default so the admin control stays functional. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ref = doc(db, 'platformSettings', 'fees');
        const snap = await getDoc(ref);
        const raw = snap.data()?.driverPayoutPercent;
        if (raw !== undefined && raw !== null) return;
        if (cancelled) return;
        await setDoc(
          ref,
          {
            driverPayoutPercent: DEFAULT_DRIVER_PAYOUT_PERCENT,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid ?? null,
          },
          { merge: true },
        );
        if (!cancelled) {
          setPayoutPercentDraft(String(DEFAULT_DRIVER_PAYOUT_PERCENT));
        }
      } catch {
        /* UI already shows the local default (80). */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (referralCodes[r.id] ?? '').toLowerCase().includes(q),
    );
  }, [rows, search, referralCodes]);

  const toggleSuspended = async (row: AdminDriverRow, suspend: boolean) => {
    setSavingId(row.id);
    try {
      await setDriverAdminSuspended(row.id, suspend);
      showSuccess(suspend ? 'Driver suspended.' : 'Driver reactivated.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Update failed.'));
    } finally {
      setSavingId(null);
    }
  };

  const savePayoutPercent = async () => {
    const n = Number.parseFloat(payoutPercentDraft.trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      showError('Enter a payout percentage between 0 and 100.');
      return;
    }
    setSavingPayout(true);
    try {
      await saveDriverPayoutPercent(n);
      showSuccess('Driver payout percentage saved.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not save payout percentage.'));
    } finally {
      setSavingPayout(false);
    }
  };

  const earningsHeader = (
    <View style={styles.earningsSection}>
      <Text style={styles.earningsTitle}>Driver Earnings</Text>
      <Text style={styles.earningsHint}>
        Global payout share of the delivery fee for all drivers.
      </Text>
      <Text style={styles.earningsLabel}>Driver payout percentage (%)</Text>
      <TextInput
        value={payoutPercentDraft}
        onChangeText={setPayoutPercentDraft}
        keyboardType="decimal-pad"
        placeholder={String(DEFAULT_DRIVER_PAYOUT_PERCENT)}
        placeholderTextColor={COLORS.textMuted}
        style={styles.earningsInput}
      />
      <Pressable
        style={[styles.earningsSave, savingPayout && styles.earningsSaveDisabled]}
        disabled={savingPayout}
        onPress={() => void savePayoutPercent()}
      >
        {savingPayout ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.earningsSaveTxt}>Save</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Driver Management"
        subtitle="Suspend or reactivate delivery partners"
      />
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search drivers…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Always mounted below search / above drivers list — not gated by loading. */}
      <View style={styles.earningsWrap}>{earningsHeader}</View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No drivers found.</Text>
          }
          renderItem={({ item }) => {
            const suspended = item.adminSuspended;
            const counters = referralCounters[item.id];
            const referralStats: AdminDriverReferralStats = {
              ...emptyAdminDriverReferralStats(referralCodes[item.id] ?? ''),
              ...(counters ?? {}),
              referralCode: referralCodes[item.id] ?? '',
            };
            const expanded = expandedDriverId === item.id;
            return (
              <View style={styles.card}>
                <Pressable
                  onPress={() =>
                    setExpandedDriverId((prev) =>
                      prev === item.id ? null : item.id,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    expanded
                      ? 'Hide driver referral details'
                      : 'Show driver referral details'
                  }
                >
                  <View style={styles.cardTop}>
                    {item.photoUrl ? (
                      <Image
                        source={{ uri: item.photoUrl }}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarLetter}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cardMain}>
                      <Text style={styles.name} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {item.email ?? 'No email'}
                      </Text>
                      <Text style={styles.meta}>ID: {item.id}</Text>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            suspended
                              ? styles.statusSuspended
                              : styles.statusOnline,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              suspended ? styles.statusSuspendedText : null,
                            ]}
                          >
                            {item.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </Pressable>
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Deliveries</Text>
                    <Text style={styles.statValue}>
                      {item.deliveriesCompleted}
                    </Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Rating</Text>
                    <Text style={styles.statValue}>
                      {item.rating != null ? item.rating.toFixed(1) : '—'}
                    </Text>
                  </View>
                </View>

                <DriverReferralStatsSection stats={referralStats} />

                {expanded ? (
                  <DriverReferredUsersList driverId={item.id} />
                ) : (
                  <Pressable
                    style={styles.expandHintBtn}
                    onPress={() => setExpandedDriverId(item.id)}
                  >
                    <Text style={styles.expandHintText}>
                      View referred users
                    </Text>
                  </Pressable>
                )}

                <View style={styles.actionsRow}>
                  {suspended ? (
                    <Pressable
                      style={[styles.actionBtn, styles.reactivateBtn]}
                      onPress={() => void toggleSuspended(item, false)}
                      disabled={savingId === item.id}
                    >
                      <Text style={styles.reactivateText}>
                        Reactivate Driver
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.actionBtn, styles.suspendBtn]}
                      onPress={() => void toggleSuspended(item, true)}
                      disabled={savingId === item.id}
                    >
                      <Text style={styles.suspendText}>Suspend Driver</Text>
                    </Pressable>
                  )}
                </View>
                {savingId === item.id ? (
                  <Text style={styles.saving}>Saving…</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  earningsWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  earningsSection: {
    ...adminCardShell,
    padding: 14,
  },
  earningsTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  earningsHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  earningsLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  earningsInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
  },
  earningsSave: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsSaveDisabled: { opacity: 0.6 },
  earningsSaveTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 32 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.border,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cardMain: { flex: 1, minWidth: 0 },
  name: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOnline: {
    backgroundColor: COLORS.successBg,
  },
  statusSuspended: {
    backgroundColor: COLORS.dangerBg,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.successText,
  },
  statusSuspendedText: {
    color: COLORS.error,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  statCell: { flex: 1 },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  referralSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  referralTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  referralLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  referralCode: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.text,
  },
  referralStatsRow: { flexDirection: 'row', gap: 10 },
  referralStatCell: { flex: 1 },
  referralStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  referralStatValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  expandHintBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  expandHintText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  referredLoading: {
    marginTop: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  referredEmpty: {
    marginTop: 12,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  referredList: { marginTop: 12, gap: 8 },
  referredHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  referredCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.background,
  },
  referredName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
  referredMeta: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  referredStatus: {
    marginTop: 6,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  actionsRow: { marginTop: 14 },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  suspendBtn: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  suspendText: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: 15,
  },
  reactivateBtn: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successText,
  },
  reactivateText: {
    color: COLORS.successText,
    fontWeight: '800',
    fontSize: 15,
  },
  saving: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
