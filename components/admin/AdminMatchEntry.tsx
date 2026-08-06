import { adminColors as COLORS } from '@/constants/adminTheme';
import { foodShareLifecycleLabel } from '@/lib/foodShareLifecycle';
import type { FoodShareMatchDoc, FoodShareMatchLifecycle } from '@/types/foodShare';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  match: FoodShareMatchDoc;
  onPress: () => void;
};

/** Lifecycle → pill colour mapping. */
function lifecycleColor(lifecycle: FoodShareMatchLifecycle | string): {
  bg: string;
  text: string;
} {
  switch (lifecycle) {
    case 'COMPLETED':
      return { bg: 'rgba(34,197,94,0.14)', text: '#4ADE80' };
    case 'CANCELLED':
      return { bg: 'rgba(239,68,68,0.14)', text: '#F87171' };
    case 'MATCHED':
    case 'ORDER_PLACED':
    case 'DRIVER_ASSIGNED':
    case 'PICKED_UP':
    case 'DELIVERED':
      return { bg: 'rgba(56,189,248,0.14)', text: '#38BDF8' };
    case 'PAYMENT_CONFIRMED':
    case 'WAITING_FOR_PAYMENT_CONFIRMATION':
      return { bg: 'rgba(168,85,247,0.18)', text: '#C084FC' };
    case 'WAITING_FOR_PAYMENT':
      return { bg: 'rgba(245,158,11,0.14)', text: '#FCD34D' };
    default:
      return { bg: 'rgba(148,163,184,0.12)', text: '#9B93B0' };
  }
}

/** Payment badge for a specific user. */
function paymentBadge(match: FoodShareMatchDoc): string | null {
  const payments = match.userPayments ?? {};
  const statuses = Object.values(payments).map((p) =>
    (p.paymentStatus ?? '').toUpperCase(),
  );
  if (statuses.length === 0) return null;
  const paidCount = statuses.filter((s) => s === 'PAID').length;
  if (paidCount === statuses.length) return 'Both paid';
  if (paidCount > 0) return `${paidCount}/${statuses.length} paid`;
  return 'Unpaid';
}

/** Short match ID suffix for display. */
function shortId(id: string): string {
  return id.length > 12 ? `…${id.slice(-10)}` : id;
}

export function AdminMatchEntry({ match, onPress }: Props) {
  const lifecycleColors = lifecycleColor(match.lifecycle);
  const payment = paymentBadge(match);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Match ${match.id}`}
    >
      {/* Left: users */}
      <View style={styles.users}>
        <Text style={styles.userLine} numberOfLines={1}>
          <Text style={styles.userLabel}>A </Text>
          {match.userA.firstName || match.userA.uid.slice(0, 8)}
        </Text>
        <Text style={styles.userLine} numberOfLines={1}>
          <Text style={styles.userLabel}>B </Text>
          {match.userB.firstName || match.userB.uid.slice(0, 8)}
        </Text>
        <Text style={styles.matchId} numberOfLines={1}>
          {shortId(match.id)}
        </Text>
      </View>

      {/* Right: status chips */}
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: lifecycleColors.bg }]}>
          <Text style={[styles.chipText, { color: lifecycleColors.text }]} numberOfLines={1}>
            {foodShareLifecycleLabel(match.lifecycle)}
          </Text>
        </View>
        {payment ? (
          <View style={styles.paymentChip}>
            <Text style={styles.paymentText} numberOfLines={1}>{payment}</Text>
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} style={styles.arrow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(168,85,247,0.10)',
    gap: 6,
  },
  rowPressed: { opacity: 0.72 },
  users: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  userLine: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  userLabel: {
    color: COLORS.textMuted,
    fontWeight: '800',
  },
  matchId: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  chips: {
    alignItems: 'flex-end',
    gap: 3,
    flexShrink: 0,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  paymentChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(148,163,184,0.10)',
  },
  paymentText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  arrow: {
    flexShrink: 0,
  },
});
