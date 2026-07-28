import { UE } from '@/constants/uberEatsTheme';
import {
  formatRepeatLastOrdered,
  formatRepeatMoney,
} from '@/lib/repeatOrderDetection';
import type { RepeatOrderRecommendation } from '@/types/repeatOrder';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  recommendation: RepeatOrderRecommendation;
  ordering?: boolean;
  onOrderAgain: () => void;
};

function RepeatOrderCardInner({
  recommendation,
  ordering,
  onOrderAgain,
}: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    scale.value = withSpring(1, { damping: 16, stiffness: 220 });
  }, [scale]);

  return (
    <Animated.View
      entering={FadeInDown.duration(420).springify().damping(18)}
      style={styles.wrap}
    >
      <View style={styles.card}>
        <View style={styles.accentRail} />
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>REPEAT ORDER</Text>
            <Text style={styles.title}>Ready for your usual?</Text>
            <Text style={styles.subtitle}>
              Your favorite order is ready whenever you are.
            </Text>
          </View>
          <View style={styles.iconGlow}>
            <Ionicons name="sparkles" size={18} color="#C4B5FD" />
          </View>
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.restaurant} numberOfLines={1}>
            {recommendation.restaurantName}
          </Text>
          <Text style={styles.summary} numberOfLines={2}>
            {recommendation.itemsSummary}
          </Text>
          <View style={styles.statsRow}>
            <Text style={styles.stat}>
              {formatRepeatMoney(recommendation.previousTotal)}
            </Text>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.statMuted}>
              Last ordered {formatRepeatLastOrdered(recommendation.lastOrderedAtMs)}
            </Text>
          </View>
          <Text style={styles.eta}>
            Est. delivery {recommendation.estimatedDeliveryLabel}
          </Text>
        </View>

        {(recommendation.hasAvailableOffer ||
          recommendation.hasShareAndSave) && (
          <View style={styles.badgeRow}>
            {recommendation.hasAvailableOffer ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>Available Offer</Text>
              </View>
            ) : null}
            {recommendation.hasShareAndSave ? (
              <View style={[styles.badge, styles.badgeShare]}>
                <Text style={styles.badgeTxt}>Share & Save Available</Text>
              </View>
            ) : null}
          </View>
        )}

        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Order again"
          disabled={ordering}
          onPressIn={() => {
            scale.value = withSpring(0.98, { damping: 16, stiffness: 400 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 14, stiffness: 280 });
          }}
          onPress={onOrderAgain}
          style={[styles.cta, ordering && styles.ctaDisabled, anim]}
        >
          {ordering ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaTxt}>Order Again</Text>
          )}
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

export const RepeatOrderCard = memo(RepeatOrderCardInner);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: UE.spaceBlock,
    marginTop: 4,
  },
  card: {
    borderRadius: UE.radiusXL,
    backgroundColor: UE.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    paddingVertical: 18,
    paddingHorizontal: 18,
    paddingLeft: 20,
    overflow: 'hidden',
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 16,
    bottom: 16,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: UE.accent,
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C4B5FD',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: UE.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: UE.textSecondary,
    lineHeight: 19,
  },
  iconGlow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
  },
  metaBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  restaurant: {
    fontSize: 16,
    fontWeight: '800',
    color: UE.text,
    letterSpacing: -0.2,
  },
  summary: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: UE.textMuted,
    lineHeight: 19,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
  },
  stat: {
    fontSize: 15,
    fontWeight: '800',
    color: UE.text,
  },
  statDot: {
    fontSize: 13,
    color: UE.textMuted,
  },
  statMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: UE.textMuted,
  },
  eta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#C4B5FD',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: UE.radiusPill,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
  },
  badgeShare: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.28)',
  },
  badgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E9D5FF',
    letterSpacing: 0.2,
  },
  cta: {
    marginTop: 16,
    height: 48,
    borderRadius: UE.radiusL,
    backgroundColor: UE.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
