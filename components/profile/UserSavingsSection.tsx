import { formatShareCurrency } from '@/lib/foodSharePricing';
import type { UserSavingsSnapshot } from '@/hooks/useUserSavings';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Palette = {
  surface: string;
  border: string;
  text: string;
  textSecondary: string;
  primary: string;
  success: string;
};

type Props = {
  savings: UserSavingsSnapshot;
  pal: Palette;
  isDark: boolean;
};

type Metric = {
  key: string;
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

function SavingsMetricCard({
  metric,
  pal,
  isDark,
}: {
  metric: Metric;
  pal: Palette;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : pal.surface,
          borderColor: pal.border,
        },
      ]}
    >
      <View style={[styles.metricIconWrap, { backgroundColor: `${metric.accent}22` }]}>
        <Ionicons name={metric.icon} size={18} color={metric.accent} />
      </View>
      <Text style={[styles.metricLabel, { color: pal.textSecondary }]} numberOfLines={2}>
        {metric.label}
      </Text>
      <Text style={[styles.metricValue, { color: pal.text }]}>
        {formatShareCurrency(metric.value)}
      </Text>
    </View>
  );
}

function UserSavingsSectionInner({ savings, pal, isDark }: Props) {
  if (savings.loading) {
    return (
      <View style={[styles.heroCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : pal.surface, borderColor: pal.border }]}>
        <ActivityIndicator color={pal.primary} />
      </View>
    );
  }

  const metrics: Metric[] = [
    {
      key: 'shared-food',
      label: 'Saved From Shared Food',
      value: savings.savedFromSharedFood,
      icon: 'restaurant-outline',
      accent: '#A855F7',
    },
    {
      key: 'promotions',
      label: 'Saved From Promotions',
      value: savings.savedFromPromotions,
      icon: 'pricetag-outline',
      accent: '#F59E0B',
    },
    {
      key: 'free-delivery',
      label: 'Saved From Free Delivery',
      value: savings.savedFromFreeDelivery,
      icon: 'bicycle-outline',
      accent: '#0EA5E9',
    },
    {
      key: 'free-service',
      label: 'Saved From Free Service Fee',
      value: savings.savedFromFreeServiceFee,
      icon: 'sparkles-outline',
      accent: '#22C55E',
    },
    {
      key: 'shared-delivery',
      label: 'Saved From Shared Delivery',
      value: savings.savedFromSharedDelivery,
      icon: 'people-outline',
      accent: '#6366F1',
    },
    {
      key: 'shared-service',
      label: 'Saved From Shared Service Fee',
      value: savings.savedFromSharedServiceFee,
      icon: 'git-compare-outline',
      accent: '#EC4899',
    },
  ];

  return (
    <View>
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: isDark ? 'rgba(124,58,237,0.18)' : '#F5F3FF',
            borderColor: isDark ? 'rgba(168,85,247,0.35)' : '#DDD6FE',
          },
        ]}
      >
        <Text style={[styles.heroEyebrow, { color: pal.textSecondary }]}>
          Lifetime Savings
        </Text>
        <Text style={[styles.heroValue, { color: pal.text }]}>
          {formatShareCurrency(savings.lifetimeSavings)}
        </Text>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: pal.text }]}>
              {savings.totalOrdersCompleted}
            </Text>
            <Text style={[styles.heroStatLabel, { color: pal.textSecondary }]}>
              Orders Completed
            </Text>
          </View>
          <View style={[styles.heroDivider, { backgroundColor: pal.border }]} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: pal.text }]}>
              {savings.totalSharedOrders}
            </Text>
            <Text style={[styles.heroStatLabel, { color: pal.textSecondary }]}>
              Shared Orders
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.grid}>
        {metrics.map((metric) => (
          <SavingsMetricCard
            key={metric.key}
            metric={metric}
            pal={pal}
            isDark={isDark}
          />
        ))}
      </View>
    </View>
  );
}

export const UserSavingsSection = memo(UserSavingsSectionInner);

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  heroValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginBottom: 14,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStat: { flex: 1 },
  heroStatValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  heroStatLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    minHeight: 118,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minHeight: 32,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '900',
  },
});
