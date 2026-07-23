import {
  buildReferralQrUrl,
  friendReferralStatusLabel,
  subscribeReferralProgram,
  type FriendReferralRow,
  type ReferralProgramStats,
} from '@/services/friendReferralProgram';
import { showError, showSuccess } from '@/utils/toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Palette = {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  onPrimary: string;
};

type Props = {
  uid: string;
  pal: Palette;
};

export function ReferralProgramCard({ uid, pal }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralProgramStats | null>(null);

  useEffect(() => {
    return subscribeReferralProgram(uid, (next) => {
      setStats(next);
      setLoading(false);
    });
  }, [uid]);

  const shareInvite = async () => {
    if (!stats) return;
    const message = `🍽️ Join me on HalfOrder!

Save money by sharing meals with people nearby.

🎁 Use my referral code:
${stats.referralCode}

📲 Download the app:
https://halforder.app/download/

After installing HalfOrder, enter my referral code during sign up to receive the referral benefits.

See you on HalfOrder!`;
    try {
      await Share.share({ message, title: 'Invite Friends' });
    } catch {
      showError('Could not open share sheet.');
    }
  };

  const copyCode = async () => {
    if (!stats) return;
    try {
      await Clipboard.setStringAsync(stats.referralCode);
      showSuccess('Referral code copied.');
    } catch {
      showError('Could not copy code.');
    }
  };

  const styles = createStyles(pal);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Invite Friends</Text>
          <Text style={styles.description}>
            Invite friends to HalfOrder and earn rewards after they complete their
            first successful order.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/referral-details' as never)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Referral details"
        >
          <MaterialIcons name="info-outline" size={22} color={pal.primary} />
        </Pressable>
      </View>

      {loading || !stats ? (
        <ActivityIndicator color={pal.primary} style={{ marginVertical: 16 }} />
      ) : (
        <>
          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>Your code</Text>
              <Text style={styles.codeValue}>{stats.referralCode}</Text>
            </View>
            {stats.inviteLink ? (
              <Image
                source={{ uri: buildReferralQrUrl(stats.inviteLink) }}
                style={styles.qr}
                contentFit="contain"
              />
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.primaryBtn} onPress={() => void shareInvite()}>
              <MaterialIcons name="ios-share" size={18} color={pal.onPrimary} />
              <Text style={styles.primaryBtnText}>Share</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={() => void copyCode()}>
              <MaterialIcons name="content-copy" size={18} color={pal.text} />
              <Text style={styles.outlineBtnText}>Copy code</Text>
            </Pressable>
          </View>

          <View style={styles.statsGrid}>
            <StatCell
              label="Invited"
              value={String(stats.totalInvited)}
              pal={pal}
            />
            <StatCell
              label="Pending"
              value={String(stats.pendingReferrals)}
              pal={pal}
            />
            <StatCell
              label="Successful"
              value={String(stats.successfulReferrals)}
              pal={pal}
            />
            <StatCell
              label="Rewards"
              value={`$${stats.totalRewardsEarned.toFixed(2)}`}
              pal={pal}
            />
          </View>

          <Pressable
            style={styles.detailsLink}
            onPress={() => router.push('/referral-details' as never)}
          >
            <Text style={styles.detailsLinkText}>View referral details</Text>
            <MaterialIcons name="chevron-right" size={20} color={pal.primary} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function StatCell({
  label,
  value,
  pal,
}: {
  label: string;
  value: string;
  pal: Palette;
}) {
  return (
    <View style={statStyles(pal).cell}>
      <Text style={statStyles(pal).value}>{value}</Text>
      <Text style={statStyles(pal).label}>{label}</Text>
    </View>
  );
}

function statStyles(pal: Palette) {
  return StyleSheet.create({
    cell: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: pal.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: pal.border,
      padding: 12,
    },
    value: {
      fontSize: 18,
      fontWeight: '800',
      color: pal.text,
    },
    label: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '600',
      color: pal.textTertiary,
    },
  });
}

function createStyles(pal: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: pal.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: pal.border,
      padding: 16,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: pal.text,
    },
    description: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: pal.textSecondary,
    },
    codeRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
      alignItems: 'center',
    },
    codeBox: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: pal.border,
      padding: 12,
      backgroundColor: pal.surface,
    },
    codeLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: pal.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    codeValue: {
      marginTop: 6,
      fontSize: 22,
      fontWeight: '900',
      letterSpacing: 2,
      color: pal.text,
    },
    qr: {
      width: 88,
      height: 88,
      borderRadius: 8,
      backgroundColor: '#fff',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: pal.primary,
      borderRadius: 12,
      paddingVertical: 12,
    },
    primaryBtnText: {
      color: pal.onPrimary,
      fontWeight: '800',
      fontSize: 15,
    },
    outlineBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: pal.border,
    },
    outlineBtnText: {
      color: pal.text,
      fontWeight: '700',
      fontSize: 15,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 14,
    },
    detailsLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: pal.border,
    },
    detailsLinkText: {
      color: pal.primary,
      fontWeight: '700',
      fontSize: 15,
    },
  });
}

export { friendReferralStatusLabel, type FriendReferralRow };
