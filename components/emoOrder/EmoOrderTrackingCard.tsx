import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type { EmoOrderTrackingStatus } from '@/types/emoOrder';

type Props = {
  restaurantName: string;
  status: EmoOrderTrackingStatus;
};

type StepKey = 'accepted' | 'picking_up' | 'on_the_way' | 'delivered';

const STEPS: { key: StepKey; label: string; emoji: string }[] = [
  { key: 'accepted', label: 'Driver accepted', emoji: '✓' },
  { key: 'picking_up', label: 'Picking up your order', emoji: '🛍' },
  { key: 'on_the_way', label: 'On the way', emoji: '🚗' },
  { key: 'delivered', label: 'Delivered!', emoji: '🎉' },
];

function stepIndex(status: EmoOrderTrackingStatus): number {
  const ds = (status.deliveryStatus ?? '').toLowerCase();
  const s = (status.status ?? '').toLowerCase();

  // Step 3 — Delivered
  if (
    ds === 'delivered' ||
    s === 'delivered' ||
    s === 'completed'
  ) return 3;

  // Step 2 — On the way (driver has food, heading to customer)
  if (
    ds === 'on_the_way' ||
    ds === 'en_route_to_customer' ||
    ds === 'driving_to_customer' ||
    ds === 'picked_up' ||
    ds === 'arrived_at_customer' ||
    ds === 'arrived'
  ) return 2;

  // Step 1 — Picking up (driver heading to or at restaurant)
  if (
    ds === 'picking_up' ||
    ds === 'en_route_to_restaurant' ||
    ds === 'driving_to_restaurant' ||
    ds === 'arrived_at_restaurant' ||
    ds === 'order_purchased' ||
    ds === 'purchased'
  ) return 1;

  // Step 0 — Accepted
  if (
    ds === 'accepted' ||
    s === 'accepted' ||
    s === 'pending_driver' ||
    ds === 'searching_driver'
  ) return 0;

  return -1;
}

function EmoOrderTrackingCardInner({ restaurantName, status }: Props) {
  const activeIndex = stepIndex(status);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>📦</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.restaurantName} numberOfLines={1}>
            {restaurantName}
          </Text>
          {status.driverName ? (
            <Text style={styles.driverName}>Driver: {status.driverName} 🖤</Text>
          ) : null}
        </View>
        {status.etaMinutes != null && status.etaMinutes > 0 ? (
          <View style={styles.etaBadge}>
            <Text style={styles.etaLabel}>ETA</Text>
            <Text style={styles.etaValue}>{status.etaMinutes}m</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Progress steps */}
      <View style={styles.steps}>
        {STEPS.map((step, i) => {
          const done = i <= activeIndex;
          const active = i === activeIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              {/* Connector line above (skip for first) */}
              {i > 0 ? (
                <View style={[styles.connectorWrap]}>
                  <View style={[styles.connector, done && styles.connectorDone]} />
                </View>
              ) : null}

              <View style={styles.stepMain}>
                {/* Dot */}
                <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                  <Text style={[styles.dotText, done && styles.dotTextDone]}>
                    {done ? step.emoji : String(i + 1)}
                  </Text>
                </View>

                {/* Label */}
                <Text style={[styles.stepLabel, done && styles.stepLabelDone, active && styles.stepLabelActive]}>
                  {step.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {status.deliveryStatus === 'delivered' ? (
        <View style={styles.deliveredBanner}>
          <Text style={styles.deliveredText}>Order delivered 🎉 enjoy your meal 🖤</Text>
        </View>
      ) : null}
    </View>
  );
}

export const EmoOrderTrackingCard = memo(EmoOrderTrackingCardInner);

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headerEmoji: { fontSize: 24 },
  headerInfo: { flex: 1 },
  restaurantName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  driverName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    fontStyle: 'italic',
  },
  etaBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
  },
  etaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: EMO_AI_PURPLE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  etaValue: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  steps: { gap: 0 },
  stepRow: { gap: 0 },
  connectorWrap: {
    alignItems: 'center',
    marginLeft: 16, // aligns with center of dot (dot width 32 / 2 = 16)
    height: 20,
  },
  connector: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1,
  },
  connectorDone: { backgroundColor: EMO_AI_PURPLE },
  stepMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  dotDone: {
    backgroundColor: 'rgba(168,85,247,0.2)',
    borderColor: EMO_AI_PURPLE,
  },
  dotActive: {
    backgroundColor: EMO_AI_PURPLE,
    borderColor: EMO_AI_PURPLE,
  },
  dotText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.3)',
  },
  dotTextDone: { color: '#FFFFFF' },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
  },
  stepLabelDone: { color: 'rgba(255,255,255,0.7)' },
  stepLabelActive: { color: '#FFFFFF', fontWeight: '800' },
  deliveredBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    alignItems: 'center',
  },
  deliveredText: {
    fontSize: 14,
    fontWeight: '800',
    color: EMO_AI_PURPLE,
    textAlign: 'center',
  },
});
