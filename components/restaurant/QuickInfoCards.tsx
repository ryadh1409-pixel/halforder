import { RP } from '@/constants/restaurantPremiumTheme';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeliveryMode } from '@/components/restaurant/DeliveryOptions';

type Props = {
  mode: DeliveryMode;
  deliveryFee: number;
  etaRange: string;
  promoThreshold?: number;
};

/**
 * Two-up cards under order type switch (delivery fee ladder + ETA) — Uber Eats style.
 */
export function QuickInfoCards({
  mode,
  deliveryFee,
  etaRange,
  promoThreshold = 25,
}: Props) {
  const feeLine =
    mode === 'delivery'
      ? deliveryFee <= 0
        ? `$0 delivery`
        : `$${deliveryFee.toFixed(2)} delivery`
      : 'Pickup — skip the fees';

  return (
    <View style={styles.row}>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>Promo</Text>
        </View>
        <Text style={styles.title}>
          {mode === 'delivery' ? `$0 delivery fee on $${promoThreshold}+` : 'Pickup ready faster'}
        </Text>
        <Text style={styles.sub}>{feeLine}</Text>
        <View style={styles.accent} />
      </Pressable>

      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={[styles.pill, styles.pillNeutral]}>
          <Text style={styles.pillTxtNeutral}>Estimate</Text>
        </View>
        <Text style={styles.title}>Arrives {etaRange}</Text>
        <Text style={styles.sub}>
          {mode === 'group' ? 'Everyone pays their share separately' : 'Live updates once you order'}
        </Text>
        <View style={[styles.accent, styles.accentMuted]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: RP.bg,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    padding: 14,
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPressed: { transform: [{ scale: 0.985 }] },
  pill: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,200,83,0.12)',
  },
  pillNeutral: { backgroundColor: RP.surface },
  pillTxt: { fontSize: 10, fontWeight: '900', color: RP.accent, letterSpacing: 0.6 },
  pillTxtNeutral: { fontSize: 10, fontWeight: '900', color: RP.textMuted, letterSpacing: 0.6 },
  title: { fontSize: 14, fontWeight: '900', color: RP.text, lineHeight: 19 },
  sub: { marginTop: 6, fontSize: 12, fontWeight: '600', color: RP.textSecondary, lineHeight: 16 },
  accent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: RP.accent,
  },
  accentMuted: { backgroundColor: RP.surface2 },
});
