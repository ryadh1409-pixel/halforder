import { UE } from '@/constants/uberEatsTheme';
import type { AbandonedCheckoutHomeCard } from '@/types/abandonedCheckoutRecovery';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useMemo } from 'react';
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
  card: AbandonedCheckoutHomeCard;
  completing?: boolean;
  onCompleteOrder: () => void;
};

function formatMoney(n: number): string {
  return `CA$${Math.max(0, n).toFixed(2)}`;
}

function formatCountdown(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function AbandonedCheckoutRecoveryCardInner({
  card,
  completing,
  onCompleteOrder,
}: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    scale.value = withSpring(1, { damping: 16, stiffness: 220 });
  }, [scale]);

  const subtitle = useMemo(() => {
    if (card.offer) return 'Still thinking about it?';
    return 'Your order is waiting.';
  }, [card.offer]);

  const countdown = formatCountdown(card.offerSecondsRemaining);

  return (
    <Animated.View
      entering={FadeInDown.duration(420).springify().damping(18)}
      style={styles.wrap}
    >
      <View style={styles.card}>
        <View style={styles.accentRail} />
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>ABANDONED CHECKOUT</Text>
            <Text style={styles.title}>🍔 Complete your order</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.iconGlow}>
            <Ionicons name="bag-handle-outline" size={18} color="#FDBA74" />
          </View>
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.restaurant} numberOfLines={1}>
            {card.restaurantName}
          </Text>
          <Text style={styles.summary} numberOfLines={2}>
            {card.itemSummary}
          </Text>
          <Text style={styles.stat}>{formatMoney(card.totalPrice)}</Text>
        </View>

        {card.offer ? (
          <View style={styles.offerBlock}>
            <Text style={styles.offerEyebrow}>🎁 Limited-Time Offer</Text>
            <Text style={styles.offerLabel}>{card.offer.label}</Text>
            {countdown ? (
              <Text style={styles.countdown}>Expires in {countdown}</Text>
            ) : null}
          </View>
        ) : null}

        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Complete order"
          disabled={completing}
          onPressIn={() => {
            scale.value = withSpring(0.98, { damping: 16, stiffness: 400 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 14, stiffness: 280 });
          }}
          onPress={onCompleteOrder}
          style={[styles.cta, completing && styles.ctaDisabled, anim]}
        >
          {completing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaTxt}>Complete Order</Text>
          )}
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

export const AbandonedCheckoutRecoveryCard = memo(
  AbandonedCheckoutRecoveryCardInner,
);

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
    borderColor: 'rgba(251, 146, 60, 0.32)',
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
    backgroundColor: '#F97316',
    opacity: 0.95,
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
    color: '#FDBA74',
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
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.28)',
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
  stat: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '800',
    color: UE.text,
  },
  offerBlock: {
    marginTop: 14,
    padding: 12,
    borderRadius: UE.radiusL,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.28)',
  },
  offerEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FDBA74',
    letterSpacing: 0.3,
  },
  offerLabel: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: UE.text,
  },
  countdown: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#FED7AA',
  },
  cta: {
    marginTop: 16,
    height: 48,
    borderRadius: UE.radiusL,
    backgroundColor: '#EA580C',
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
