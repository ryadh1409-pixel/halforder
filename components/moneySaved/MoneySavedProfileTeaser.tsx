import { formatCadAmount, useCountUpValue } from '@/hooks/useCountUpValue';
import type { MoneySavedAggregated } from '@/lib/moneySavedAggregation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Palette = {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  success: string;
};

type Props = {
  data: MoneySavedAggregated;
  pal: Palette;
  isDark: boolean;
  onPress: () => void;
};

function MoneySavedProfileTeaserInner({ data, pal, isDark, onPress }: Props) {
  const animated = useCountUpValue(data.lifetime.totalLifetimeSavings, {
    enabled: !data.loading,
    durationMs: 900,
  });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open Money Saved"
    >
      <LinearGradient
        colors={
          isDark
            ? ['#1a1033', '#2d1b69']
            : ['#F5F3FF', '#EDE9FE']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            borderColor: isDark ? 'rgba(168,85,247,0.35)' : '#DDD6FE',
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="wallet" size={22} color={pal.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.eyebrow, { color: pal.textSecondary }]}>Money Saved</Text>
            {data.loading ? (
              <ActivityIndicator color={pal.primary} style={styles.loader} />
            ) : (
              <Text style={[styles.amount, { color: pal.text }]}>
                {formatCadAmount(animated)}
              </Text>
            )}
            <Text style={[styles.subtitle, { color: pal.textSecondary }]}>
              Tap to view your savings breakdown
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={pal.textSecondary} />
        </View>

        {!data.loading ? (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: pal.text }]}>
                {data.currentMonth.sharedOrders}
              </Text>
              <Text style={[styles.statLabel, { color: pal.textSecondary }]}>
                Shared this month
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: pal.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: pal.success }]}>
                {formatCadAmount(data.currentMonth.savingsThisMonth)}
              </Text>
              <Text style={[styles.statLabel, { color: pal.textSecondary }]}>
                Saved this month
              </Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

export const MoneySavedProfileTeaser = memo(MoneySavedProfileTeaserInner);

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  amount: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  stat: {
    flex: 1,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    alignSelf: 'stretch',
  },
});
