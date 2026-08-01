import { formatCadAmount, useCountUpValue } from '@/hooks/useCountUpValue';
import type { MoneySavedAggregated } from '@/lib/moneySavedAggregation';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type Theme = {
  bg: string;
  card: string;
  cardElevated: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  primary: string;
  shadow: string;
};

type Props = {
  data: MoneySavedAggregated;
  theme: Theme;
  isDark: boolean;
};

function AnimatedMoney({
  value,
  enabled,
  style,
}: {
  value: number;
  enabled: boolean;
  style: object;
}) {
  const animated = useCountUpValue(value, { enabled });
  return <Text style={style}>{formatCadAmount(animated)}</Text>;
}

function SectionTitle({ children, theme }: { children: string; theme: Theme }) {
  return <Text style={[styles.sectionTitle, { color: theme.text }]}>{children}</Text>;
}

function StatLine({
  label,
  value,
  theme,
  bold,
  success,
}: {
  label: string;
  value: string;
  theme: Theme;
  bold?: boolean;
  success?: boolean;
}) {
  return (
    <View style={styles.statLine}>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          { color: success ? theme.success : theme.text },
          bold && styles.statValueBold,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function BreakdownCard({
  icon,
  title,
  description,
  amount,
  theme,
  isDark,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  amount: number;
  theme: Theme;
  isDark: boolean;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420)}
      style={[
        styles.breakdownCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}
    >
      <View
        style={[
          styles.breakdownIcon,
          { backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.1)' },
        ]}
      >
        <Ionicons name={icon} size={22} color={theme.success} />
      </View>
      <View style={styles.breakdownCopy}>
        <Text style={[styles.breakdownTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.breakdownDesc, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Text style={[styles.breakdownAmount, { color: theme.success }]}>
        {formatCadAmount(amount)}
      </Text>
    </Animated.View>
  );
}

function MoneySavedScreenContentInner({ data, theme, isDark }: Props) {
  if (data.loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const breakdownItems = [
    {
      key: 'food',
      icon: 'restaurant-outline' as const,
      title: 'Food Savings',
      description: 'Money saved because you paid only your share.',
      amount: data.savedFromSharedFood,
    },
    {
      key: 'promo',
      icon: 'pricetag-outline' as const,
      title: 'Promotion Savings',
      description: 'Money saved from offers and discounts.',
      amount: data.savedFromPromotions,
    },
    {
      key: 'free-del',
      icon: 'bicycle-outline' as const,
      title: 'Free Delivery Savings',
      description: 'Money saved because delivery was free.',
      amount: data.savedFromFreeDelivery,
    },
    {
      key: 'free-svc',
      icon: 'sparkles-outline' as const,
      title: 'Free Service Fee Savings',
      description: 'Money saved because the service fee was waived.',
      amount: data.savedFromFreeServiceFee,
    },
    {
      key: 'shared-del',
      icon: 'people-outline' as const,
      title: 'Shared Delivery Savings',
      description: 'Money saved by splitting the delivery fee.',
      amount: data.savedFromSharedDelivery,
    },
    {
      key: 'shared-svc',
      icon: 'git-compare-outline' as const,
      title: 'Shared Service Fee Savings',
      description: 'Money saved by splitting the service fee.',
      amount: data.savedFromSharedServiceFee,
    },
  ];

  const lifetimeRows = [
    {
      label: 'Lifetime Shared Orders',
      value: String(data.lifetime.lifetimeSharedOrders),
    },
    {
      label: 'Lifetime Completed Orders',
      value: String(data.lifetime.lifetimeCompletedOrders),
    },
    {
      label: 'Total Meals Shared',
      value: String(data.lifetime.totalMealsShared),
    },
    {
      label: 'Average Saved Per Order',
      value: formatCadAmount(data.lifetime.averageSavedPerOrder),
    },
    {
      label: 'Highest Saving In One Order',
      value: formatCadAmount(data.lifetime.highestSavingInOneOrder),
    },
    {
      label: 'Total Lifetime Savings',
      value: formatCadAmount(data.lifetime.totalLifetimeSavings),
      success: true,
      bold: true,
    },
  ];

  return (
    <View style={styles.content}>
      <Animated.View entering={FadeInDown.duration(500)}>
        <LinearGradient
          colors={
            isDark
              ? ['#1a1033', '#2d1b69', '#1e1b4b']
              : ['#7C3AED', '#8B5CF6', '#A855F7']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.heroEyebrow}>Money Saved</Text>
          <View style={styles.heroIconWrap}>
            <Ionicons name="wallet" size={32} color="#FFFFFF" />
          </View>
          <Text style={styles.heroLabel}>Total Lifetime Savings</Text>
          <AnimatedMoney
            value={data.lifetime.totalLifetimeSavings}
            enabled={!data.loading}
            style={styles.heroAmount}
          />
          <Text style={styles.heroSubtitle}>
            You&apos;ve saved money by sharing meals with other people.
          </Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(80).duration(420)}
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow },
        ]}
      >
        <Text style={[styles.monthTitle, { color: theme.text }]}>
          {data.currentMonth.label || 'This Month'}
        </Text>
        <StatLine
          label="Shared Orders"
          value={String(data.currentMonth.sharedOrders)}
          theme={theme}
        />
        <StatLine
          label="Original Food Value"
          value={formatCadAmount(data.currentMonth.originalFoodValue)}
          theme={theme}
        />
        <StatLine
          label="You Paid"
          value={formatCadAmount(data.currentMonth.youPaid)}
          theme={theme}
        />
        <StatLine
          label="Money Saved"
          value={formatCadAmount(data.currentMonth.moneySaved)}
          theme={theme}
          success
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <StatLine
          label="Savings This Month"
          value={formatCadAmount(data.currentMonth.savingsThisMonth)}
          theme={theme}
          success
          bold
        />
      </Animated.View>

      <SectionTitle theme={theme}>Savings Breakdown</SectionTitle>
      {breakdownItems.map((item, index) => (
        <BreakdownCard
          key={item.key}
          icon={item.icon}
          title={item.title}
          description={item.description}
          amount={item.amount}
          theme={theme}
          isDark={isDark}
          delay={120 + index * 50}
        />
      ))}

      <Animated.View entering={FadeInDown.delay(420).duration(420)}>
        <SectionTitle theme={theme}>Lifetime Stats</SectionTitle>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow },
          ]}
        >
          {lifetimeRows.map((row) => (
            <StatLine
              key={row.label}
              label={row.label}
              value={row.value}
              theme={theme}
              bold={'bold' in row ? row.bold : false}
              success={'success' in row ? row.success : false}
            />
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(480).duration(420)}>
        <SectionTitle theme={theme}>Order History</SectionTitle>
        {data.orderHistory.length === 0 ? (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow },
            ]}
          >
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Complete a shared order to see your savings history here.
            </Text>
          </View>
        ) : (
          data.orderHistory.map((row, index) => (
            <Animated.View
              key={row.id}
              entering={FadeInDown.delay(520 + index * 40).duration(360)}
              style={[
                styles.historyCard,
                { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow },
              ]}
            >
              <View style={styles.historyTop}>
                <Text style={[styles.historyRestaurant, { color: theme.text }]} numberOfLines={1}>
                  {row.restaurantName}
                </Text>
                <View style={styles.savedBadge}>
                  <Text style={styles.savedBadgeText}>
                    Saved {formatCadAmount(row.saved).replace(' CAD', '')}
                  </Text>
                </View>
              </View>
              <Text style={[styles.historyDate, { color: theme.textSecondary }]}>
                {row.dateMs
                  ? new Date(row.dateMs).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </Text>
              <View style={styles.historyAmounts}>
                <View>
                  <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
                    Original
                  </Text>
                  <Text style={[styles.historyValue, { color: theme.text }]}>
                    {formatCadAmount(row.originalPrice).replace(' CAD', '')}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>Paid</Text>
                  <Text style={[styles.historyValue, { color: theme.text }]}>
                    {formatCadAmount(row.paid).replace(' CAD', '')}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>Saved</Text>
                  <Text style={[styles.historyValue, { color: theme.success }]}>
                    {formatCadAmount(row.saved).replace(' CAD', '')}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))
        )}
      </Animated.View>
    </View>
  );
}

export const MoneySavedScreenContent = memo(MoneySavedScreenContentInner);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 14,
  },
  loadingWrap: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 4,
    overflow: 'hidden',
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 10,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  statLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 12,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  statValueBold: {
    fontSize: 16,
    fontWeight: '900',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 2,
  },
  breakdownCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  breakdownIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownCopy: {
    flex: 1,
    minWidth: 0,
  },
  breakdownTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  breakdownDesc: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  breakdownAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  historyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  historyRestaurant: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  savedBadge: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  savedBadgeText: {
    color: '#A855F7',
    fontSize: 12,
    fontWeight: '800',
  },
  historyDate: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  historyAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyMeta: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  historyValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
