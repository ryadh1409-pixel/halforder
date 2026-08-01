import {
  buildDriverReferralInviteLink,
  buildDriverReferralInviteMessage,
  buildDriverReferralQrUrl,
  getDriverReferralDashboard,
} from '@/services/driverReferralProgram';
import type {
  DriverReferralDashboard,
  DriverReferralHistoryRow,
  DriverReferralRewardStatus,
} from '@/types/driverReferralProgram';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  driverId: string | null | undefined;
};

const STATUS_STYLE: Record<
  DriverReferralRewardStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'Pending',
    color: '#FBBF24',
    background: 'rgba(251, 191, 36, 0.14)',
  },
  approved: {
    label: 'Approved',
    color: '#C084FC',
    background: 'rgba(168, 85, 247, 0.18)',
  },
  paid: {
    label: 'Paid',
    color: '#34D399',
    background: 'rgba(52, 211, 153, 0.14)',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#F87171',
    background: 'rgba(248, 113, 113, 0.14)',
  },
};

function formatMoney(amount: number): string {
  return `$${Math.max(0, amount).toFixed(2)}`;
}

function formatOrderDate(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return 'Awaiting first order';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Driver Referral Program card. Visible only while the Admin campaign is both
 * enabled and set to show inside the driver app.
 */
export function DriverReferralProgramCard({ driverId }: Props) {
  console.log('[DriverReferralProgramCard] mounted');
  const [dashboard, setDashboard] = useState<DriverReferralDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;

  const load = useCallback(async () => {
    if (!driverId) {
      setDashboard(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDashboard(await getDriverReferralDashboard());
    } catch (error) {
      console.log('[DriverReferralProgramCard] dashboard load failed', {
        code: (error as { code?: string })?.code,
        message: (error as { message?: string })?.message,
      });
      // Non-drivers and disabled campaigns simply hide this card.
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    !!dashboard?.campaign.enabled && !!dashboard?.campaign.visibleInDriverApp;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, slide]);

  const shareLink = useCallback(async () => {
    if (!dashboard) return;
    try {
      await Share.share({
        title: 'Join HalfOrder',
        message: buildDriverReferralInviteMessage(dashboard.code),
      });
    } catch {
      showError('Could not open the share sheet.');
    }
  }, [dashboard]);

  const copyCode = useCallback(async () => {
    if (!dashboard) return;
    try {
      await Clipboard.setStringAsync(
        buildDriverReferralInviteMessage(dashboard.code),
      );
      showSuccess('Referral invitation copied.');
    } catch {
      showError('Could not copy your referral code.');
    }
  }, [dashboard]);

  console.log('[DriverReferralProgramCard] render state', {
    driverId,
    loading,
    dashboard,
    campaignEnabled: dashboard?.campaign?.enabled,
    campaignVisibleInDriverApp: dashboard?.campaign?.visibleInDriverApp,
    visible,
  });

  if (loading) {
    return (
      <View style={styles.loadingCard}>
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  if (!dashboard || !visible) return null;

  const inviteLink = buildDriverReferralInviteLink(dashboard.code);
  const rewardLabel =
    dashboard.campaign.rewardType === 'fixed_amount'
      ? `${formatMoney(dashboard.campaign.fixedRewardCad)} per referral`
      : `${Math.round(dashboard.campaign.rewardPercentage)}% of the delivery fee`;

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: fade, transform: [{ translateY: slide }] },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Ionicons name="gift" size={18} color="#A855F7" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Referral Program</Text>
          <Text style={styles.subtitle}>
            Invite new customers and earn {rewardLabel} on their first completed
            order.
          </Text>
        </View>
      </View>

      {dashboard.campaign.paused ? (
        <View style={styles.pausedPill}>
          <Ionicons name="pause-circle" size={14} color="#FBBF24" />
          <Text style={styles.pausedText}>
            New referrals are paused. Approved rewards are unaffected.
          </Text>
        </View>
      ) : null}

      <View style={styles.codeRow}>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Your code</Text>
          <Text style={styles.codeValue}>{dashboard.code}</Text>
          <Text style={styles.linkValue} numberOfLines={2}>
            {inviteLink}
          </Text>
        </View>
        <View style={styles.qrFrame}>
          <Image
            source={{ uri: buildDriverReferralQrUrl(inviteLink) }}
            style={styles.qr}
            contentFit="contain"
            transition={200}
            cachePolicy="memory-disk"
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => void shareLink()}
          accessibilityRole="button"
          accessibilityLabel="Share referral link"
        >
          <Ionicons name="share-social" size={17} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Share link</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void copyCode()}
          accessibilityRole="button"
          accessibilityLabel="Copy referral code"
        >
          <Ionicons name="copy-outline" size={17} color="#E9D5FF" />
          <Text style={styles.secondaryButtonText}>Copy code</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatCell
          label="Successful"
          value={String(dashboard.stats.successfulReferrals)}
        />
        <StatCell
          label="Pending"
          value={String(dashboard.stats.pendingRewards)}
        />
        <StatCell
          label="Total rewards"
          value={formatMoney(dashboard.stats.totalReferralRewardsCad)}
        />
      </View>

      <Text style={styles.historyHeading}>Referral History</Text>
      {dashboard.history.length === 0 ? (
        <Text style={styles.emptyHistory}>
          No referrals yet. Share your link to get started.
        </Text>
      ) : (
        <View style={styles.historyList}>
          {dashboard.history.map((row) => (
            <HistoryRow key={row.id} row={row} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HistoryRow({ row }: { row: DriverReferralHistoryRow }) {
  const status = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending;
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyMain}>
        <Text style={styles.historyCustomer} numberOfLines={1}>
          {row.customerName}
        </Text>
        <Text style={styles.historyDate}>{formatOrderDate(row.orderDateMs)}</Text>
      </View>
      <View style={styles.historyTrailing}>
        <Text style={styles.historyAmount}>
          {formatMoney(row.rewardAmountCad)}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: status.background }]}>
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    alignSelf: 'stretch',
    marginBottom: 20,
    paddingVertical: 26,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
    backgroundColor: '#151126',
    alignItems: 'center',
  },
  card: {
    alignSelf: 'stretch',
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    backgroundColor: '#151126',
  },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
  },
  headerText: { flex: 1 },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: '#9BA3B4',
  },
  pausedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
  },
  pausedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#FCD34D',
  },
  codeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    alignItems: 'stretch',
  },
  codeBox: {
    flex: 1,
    justifyContent: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
    backgroundColor: '#101018',
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8B93A5',
  },
  codeValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: '#FFFFFF',
  },
  linkValue: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#C084FC',
  },
  qrFrame: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  qr: { width: 84, height: 84 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    backgroundColor: '#A855F7',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
    backgroundColor: 'rgba(168, 85, 247, 0.10)',
  },
  secondaryButtonText: { color: '#E9D5FF', fontSize: 15, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statCell: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#101018',
  },
  statValue: { fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8B93A5',
  },
  historyHeading: {
    marginTop: 18,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#8B93A5',
  },
  emptyHistory: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    color: '#7D8493',
  },
  historyList: { marginTop: 10, gap: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#101018',
  },
  historyMain: { flex: 1 },
  historyCustomer: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  historyDate: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#8B93A5',
  },
  historyTrailing: { alignItems: 'flex-end', gap: 6 },
  historyAmount: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
});
