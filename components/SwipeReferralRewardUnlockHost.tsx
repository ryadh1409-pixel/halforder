import {
  acknowledgeSwipeReferralRewardUnlock,
  subscribeUnacknowledgedSwipeReferralRewards,
  type SwipeReferralReward,
} from '@/services/swipeReferralReward';
import { useAuth } from '@/services/AuthContext';
import { theme } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/**
 * Shows a one-time unlock modal when a Swipe referral reward is granted.
 * Mounted at app root — does not alter checkout or swipe flows.
 */
export function SwipeReferralRewardUnlockHost() {
  const { user } = useAuth();
  const [reward, setReward] = useState<SwipeReferralReward | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setReward(null);
      return undefined;
    }
    return subscribeUnacknowledgedSwipeReferralRewards((rows) => {
      setReward(rows[0] ?? null);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!reward?.id) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [reward?.id]);

  const onDismiss = () => {
    const id = reward?.id;
    setReward(null);
    if (id) {
      void acknowledgeSwipeReferralRewardUnlock(id).catch(() => undefined);
    }
  };

  if (!reward) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Reward Unlocked!</Text>
          <Text style={styles.body}>
            You earned a {reward.discountPercent}% discount.
          </Text>
          <Text style={styles.codeLabel}>Your code</Text>
          <Text style={styles.code}>{reward.code}</Text>
          <Text style={styles.hint}>
            Redeem it during your next eligible checkout — it will not apply
            automatically.
          </Text>
          <Pressable style={styles.cta} onPress={onDismiss}>
            <Text style={styles.ctaTxt}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const c = theme.colors;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 24,
    backgroundColor: '#141820',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    alignItems: 'center',
  },
  emoji: { fontSize: 44, marginBottom: 8 },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B7BDC9',
    textAlign: 'center',
    marginBottom: 18,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  code: {
    fontSize: 22,
    fontWeight: '900',
    color: c.primary,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B93A7',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  cta: {
    alignSelf: 'stretch',
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
