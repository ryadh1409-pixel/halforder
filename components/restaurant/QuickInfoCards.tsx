import { RP } from '@/constants/restaurantPremiumTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const GOLD = '#F59E0B';
const GOLD_BG = 'rgba(245,158,11,0.07)';
const GOLD_BORDER = 'rgba(245,158,11,0.22)';

import type { DeliveryMode } from '@/components/restaurant/DeliveryOptions';

type Props = {
  mode: DeliveryMode;
  deliveryFeeLabel: string;
  etaLabel: string;
  promoLabel: string | null;
};

export function QuickInfoCards({
  mode,
  deliveryFeeLabel,
  etaLabel,
  promoLabel,
}: Props) {
  const etaUnavailable = etaLabel === 'ETA unavailable';
  const isFree = deliveryFeeLabel.toLowerCase().includes('free');

  const deliveryTitle = promoLabel ?? (mode === 'pickup' ? 'Pickup order' : deliveryFeeLabel);
  const deliverySub = promoLabel
    ? deliveryFeeLabel
    : mode === 'pickup'
      ? 'No delivery fee on pickup'
      : 'Confirmed at checkout';

  const etaTitle = etaUnavailable ? 'No estimate' : `Arrives ${etaLabel}`;
  const etaSub = etaUnavailable
    ? 'Enable location for ETA'
    : 'Updates after order placed';

  return (
    <View style={styles.row}>
      {/* Delivery card */}
      <View style={[styles.card, isFree && styles.cardAccent]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, isFree && styles.iconWrapAccent]}>
            <Ionicons
              name="bicycle-outline"
              size={16}
              color={isFree ? GOLD : RP.textMuted}
            />
          </View>
          {isFree && (
            <View style={styles.freePill}>
              <Text style={styles.freePillTxt}>FREE</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardTitle, isFree && styles.cardTitleAccent]} numberOfLines={2}>
          {deliveryTitle}
        </Text>
        <Text style={styles.cardSub} numberOfLines={2}>
          {deliverySub}
        </Text>
        <View style={[styles.bar, isFree && styles.barAccent]} />
      </View>

      {/* ETA card */}
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.iconWrap}>
            <Ionicons name="time-outline" size={16} color={RP.textMuted} />
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {etaTitle}
        </Text>
        <Text style={styles.cardSub} numberOfLines={2}>
          {etaSub}
        </Text>
        <View style={styles.bar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
  },
  card: {
    flex: 1,
    backgroundColor: RP.surface,
    borderRadius: RP.radiusM,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
    padding: 14,
    overflow: 'hidden',
  },
  cardAccent: {
    borderColor: GOLD_BORDER,
    backgroundColor: GOLD_BG,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: RP.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapAccent: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  freePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  freePillTxt: {
    fontSize: 10,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: RP.text,
    lineHeight: 19,
  },
  cardTitleAccent: { color: GOLD },
  cardSub: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: RP.textMuted,
    lineHeight: 15,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: RP.border,
  },
  barAccent: { backgroundColor: GOLD },
});
