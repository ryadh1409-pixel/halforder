import { USER_ROUTES } from '@/lib/navigationPaths';
import type { SmartMatchOrder } from '@/services/matchingEngine';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useMemo } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { platformElevation } from '@/utils/platformElevation';
import { showNotice } from '@/utils/toast';

type Props = {
  order: SmartMatchOrder;
  /** Stagger list entrance (horizontal list index). */
  index?: number;
};

function foodEmoji(foodName: string, foodType?: string | null): string {
  const blob = `${foodType ?? ''} ${foodName}`.toLowerCase();
  if (blob.includes('pizza')) return '🍕';
  if (blob.includes('burger')) return '🍔';
  if (blob.includes('sushi') || blob.includes('ramen')) return '🍣';
  if (blob.includes('salad') || blob.includes('healthy')) return '🥗';
  if (blob.includes('taco') || blob.includes('burrito')) return '🌮';
  if (blob.includes('coffee') || blob.includes('café')) return '☕';
  if (blob.includes('dessert') || blob.includes('cake')) return '🍰';
  return '🍽️';
}

function formatDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return 'Nearby';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function SmartMatchChipInner({ order, index = 0 }: Props) {
  const router = useRouter();
  const isDemo = order.id.startsWith('demo-');
  const emoji = useMemo(
    () => foodEmoji(order.foodName, order.foodType),
    [order.foodName, order.foodType],
  );
  const enterDelay = Math.min(index * 55, 280);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => {
        if (isDemo) {
          showNotice(
            'Demo match',
            'This card is for development layout checks — not a live order.',
          );
          return;
        }
        router.push(USER_ROUTES.order(order.id) as never);
      }}
    >
      <Animated.View
        entering={FadeInRight.delay(enterDelay).duration(380)}
        style={styles.cardOuter}
      >
        <LinearGradient
          colors={['rgba(30, 41, 59, 0.95)', 'rgba(15, 23, 42, 0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <View style={styles.topRow}>
            {order.restaurantImageUrl ? (
              <Image
                source={{ uri: order.restaurantImageUrl }}
                style={styles.logo}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoEmoji}>{emoji}</Text>
              </View>
            )}
            <View style={styles.topText}>
              <View style={styles.titleRow}>
                <Text style={styles.chipTitle} numberOfLines={1}>
                  {order.restaurantName}
                </Text>
                <View style={styles.scoreBadge}>
                  <Text style={styles.scoreText}>{order.score}</Text>
                </View>
              </View>
              <Text style={styles.chipFood} numberOfLines={1}>
                {order.foodName}
              </Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            {order.etaMinutes != null && Number.isFinite(order.etaMinutes) ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>ETA ~{order.etaMinutes}m</Text>
              </View>
            ) : null}
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{formatDistance(order.distanceMeters)}</Text>
            </View>
            {typeof order.slotsOpen === 'number' && order.slotsOpen > 0 ? (
              <View style={[styles.metaChip, styles.slotChip]}>
                <Text style={styles.metaChipText}>{order.slotsOpen} open</Text>
              </View>
            ) : null}
          </View>

          <LinearGradient
            colors={['rgba(110, 231, 183, 0.35)', 'rgba(52, 211, 153, 0.08)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.joinBar}
          >
            <Text style={styles.joinText}>{isDemo ? 'Demo' : 'Join'} →</Text>
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

export const SmartMatchChip = memo(SmartMatchChipInner);

const styles = StyleSheet.create({
  cardOuter: {
    width: 216,
    marginRight: 10,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.22)',
    ...platformElevation({
      web: '0px 4px 14px rgba(0, 0, 0, 0.45)',
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 4 },
    }),
  },
  gradient: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.25)',
  },
  logoEmoji: {
    fontSize: 22,
  },
  topText: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipTitle: {
    flex: 1,
    minWidth: 0,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: -0.2,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(110, 231, 183, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.45)',
  },
  scoreText: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '800',
  },
  chipFood: {
    color: '#7D8493',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(23,25,35,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  slotChip: {
    borderColor: 'rgba(110, 231, 183, 0.25)',
    backgroundColor: 'rgba(110, 231, 183, 0.08)',
  },
  metaChipText: {
    color: '#7D8493',
    fontSize: 11,
    fontWeight: '700',
  },
  joinBar: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
