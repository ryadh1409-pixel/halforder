import {
  friendReferralStatusLabel,
  subscribeReferralProgram,
  type FriendReferralRow,
  type ReferralProgramStats,
  type ReferralRewardRow,
} from '@/services/friendReferralProgram';
import { useAuth } from '@/services/AuthContext';
import { theme } from '@/constants/theme';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { formatRelativeTime } from '@/utils/time';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showError, showSuccess } from '@/utils/toast';

const pal = theme.colors;

export default function ReferralDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralProgramStats | null>(null);
  const [friends, setFriends] = useState<FriendReferralRow[]>([]);
  const [rewards, setRewards] = useState<ReferralRewardRow[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribeReferralProgram(uid, (nextStats, nextFriends, nextRewards) => {
      setStats(nextStats);
      setFriends(nextFriends ?? []);
      setRewards(nextRewards ?? []);
      setLoading(false);
    });
  }, [uid]);

  const shareInvite = async () => {
    if (!stats) return;
    const message = `Join me on HalfOrder! Use my code ${stats.referralCode} or open ${stats.inviteLink}`;
    try {
      await Share.share({ message, url: stats.inviteLink, title: 'Invite Friends' });
    } catch {
      showError('Could not open share sheet.');
    }
  };

  const copyLink = async () => {
    if (!stats) return;
    try {
      await Clipboard.setStringAsync(stats.inviteLink);
      showSuccess('Invite link copied.');
    } catch {
      showError('Could not copy link.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
        >
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Referral Details</Text>
      </View>
      {loading || !stats ? (
        <View style={styles.centered}>
          <ActivityIndicator color={pal.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Section title="How referrals work">
            <Text style={styles.body}>
              Share your personal invite link or referral code with friends. When
              they sign up and complete their first successful order, you earn a
              reward credited to your HalfOrder balance.
            </Text>
            <Text style={styles.body}>
              Your link: {stats.inviteLink}
            </Text>
            <View style={styles.inlineActions}>
              <Pressable style={styles.primaryBtn} onPress={() => void shareInvite()}>
                <Text style={styles.primaryBtnText}>Share invite</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => void copyLink()}>
                <Text style={styles.outlineBtnText}>Copy link</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Reward policy">
            <Text style={styles.body}>
              Rewards are issued after a referred friend completes their first
              successful order. Pending referrals become successful once delivery is
              confirmed. Issued rewards appear in your reward balance and can be
              used on future orders.
            </Text>
          </Section>

          <Section title="Reward summary">
            <View style={styles.summaryGrid}>
              <SummaryCell label="Current balance" value={`$${stats.currentRewardBalance.toFixed(2)}`} />
              <SummaryCell label="Lifetime rewards" value={`$${stats.lifetimeRewards.toFixed(2)}`} />
              <SummaryCell label="Successful referrals" value={String(stats.successfulReferrals)} />
              <SummaryCell label="Pending referrals" value={String(stats.pendingReferrals)} />
            </View>
          </Section>

          <Section title="Reward history">
            {rewards.length === 0 ? (
              <Text style={styles.muted}>No rewards yet.</Text>
            ) : (
              rewards.map((row) => (
                <View key={row.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>{row.label}</Text>
                    <Text style={styles.muted}>
                      {row.createdAtMs
                        ? formatRelativeTime(row.createdAtMs)
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>
                      ${row.amount.toFixed(2)}
                    </Text>
                    <Text
                      style={[
                        styles.historyStatus,
                        row.status === 'issued'
                          ? styles.statusIssued
                          : styles.statusPending,
                      ]}
                    >
                      {row.status === 'issued' ? 'Issued' : 'Pending'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Section>

          <Section title="Referral history">
            {friends.length === 0 ? (
              <Text style={styles.muted}>No invited friends yet.</Text>
            ) : (
              friends.map((friend) => (
                <View key={friend.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyTitle}>
                      {friend.friendName ?? friend.friendEmail ?? 'Friend'}
                    </Text>
                    <Text style={styles.muted}>
                      {friend.friendEmail ?? friend.friendUid ?? '—'}
                    </Text>
                  </View>
                  <Text style={styles.friendStatus}>
                    {friendReferralStatusLabel(friend.status)}
                  </Text>
                </View>
              ))
            )}
          </Section>

          <Section title="Friend progress">
            <Text style={styles.muted}>
              Track each friend from invite through registration, first order, and
              reward issuance.
            </Text>
            {friends.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>No progress yet.</Text>
            ) : (
              friends.map((friend) => (
                <View key={`progress-${friend.id}`} style={styles.progressCard}>
                  <Text style={styles.historyTitle}>
                    {friend.friendName ?? 'Friend'}
                  </Text>
                  <ProgressStep
                    label="Invited"
                    done={
                      friend.status === 'invited' ||
                      friend.status === 'registered' ||
                      friend.status === 'completed_first_order' ||
                      friend.status === 'reward_issued'
                    }
                  />
                  <ProgressStep
                    label="Registered"
                    done={
                      friend.status === 'registered' ||
                      friend.status === 'completed_first_order' ||
                      friend.status === 'reward_issued'
                    }
                  />
                  <ProgressStep
                    label="Completed first order"
                    done={
                      friend.status === 'completed_first_order' ||
                      friend.status === 'reward_issued'
                    }
                  />
                  <ProgressStep
                    label="Reward issued"
                    done={friend.status === 'reward_issued'}
                  />
                </View>
              ))
            )}
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ProgressStep({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.progressRow}>
      <View style={[styles.progressDot, done ? styles.progressDotDone : null]} />
      <Text style={[styles.progressLabel, done ? styles.progressLabelDone : null]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: pal.backgroundDark },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: {
    color: pal.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  screenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: pal.text,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  section: {
    marginBottom: 20,
    backgroundColor: pal.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: pal.border,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: pal.text,
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: pal.textSecondary,
    marginBottom: 8,
  },
  muted: {
    fontSize: 14,
    color: pal.textMuted,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: pal.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: pal.textOnPrimary,
    fontWeight: '800',
  },
  outlineBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: pal.border,
  },
  outlineBtnText: {
    color: pal.text,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCell: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pal.border,
    padding: 12,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: pal.text,
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: pal.textMuted,
    fontWeight: '600',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: pal.border,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: pal.text,
  },
  historyRight: { alignItems: 'flex-end' },
  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: pal.text,
  },
  historyStatus: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  statusIssued: { color: pal.successTextDark },
  statusPending: { color: pal.warningTextDark },
  friendStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: pal.primary,
    maxWidth: 120,
    textAlign: 'right',
  },
  progressCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pal.border,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: pal.border,
  },
  progressDotDone: {
    backgroundColor: pal.primary,
  },
  progressLabel: {
    fontSize: 14,
    color: pal.textMuted,
  },
  progressLabelDone: {
    color: pal.text,
    fontWeight: '600',
  },
});
