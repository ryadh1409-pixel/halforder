import { RP } from '@/constants/restaurantPremiumTheme';
import { RESTAURANT_INFO_OVERLAP } from '@/constants/restaurantLayout';
import {
  formatRatingCompact,
  type RatingDisplay,
} from '@/lib/restaurantStoreMetrics';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { RestaurantProfile } from '@/hooks/useRestaurantProfile';

type Props = {
  profile: RestaurantProfile;
  ratingDisplay: RatingDisplay;
  deliveryFeeLabel: string;
  serviceFeeLabel: string;
  distanceLabel: string | null;
  etaLabel: string;
  statusLabel: string | null;
  statusSubtext: string | null;
  promoLabel: string | null;
};

export function RestaurantInfo({
  profile,
  ratingDisplay,
  deliveryFeeLabel,
  serviceFeeLabel,
  distanceLabel,
  etaLabel,
  statusLabel,
  statusSubtext,
  promoLabel,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.logoWrap}>
          {profile.image ? (
            <Image source={{ uri: profile.image }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoLetter}>{profile.name.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{profile.name}</Text>
          <View style={styles.ratingRow}>
            {ratingDisplay.kind === 'rated' ? (
              <Text style={styles.ratingCompact}>
                {formatRatingCompact(
                  ratingDisplay.rating,
                  ratingDisplay.reviewCount,
                )}
              </Text>
            ) : (
              <Text style={styles.newLabel}>New</Text>
            )}
          </View>
          {promoLabel ? (
            <View style={styles.badgeRow}>
              <View style={styles.badgePromo}>
                <Text style={styles.badgePromoText}>{promoLabel}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Delivery</Text>
          <Text style={styles.metricVal} numberOfLines={2}>
            {deliveryFeeLabel}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Service</Text>
          <Text style={styles.metricVal}>{serviceFeeLabel}</Text>
        </View>
        {distanceLabel ? (
          <>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Distance</Text>
              <Text style={styles.metricVal}>{distanceLabel}</Text>
            </View>
          </>
        ) : null}
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>ETA</Text>
          <Text style={styles.metricVal} numberOfLines={2}>
            {etaLabel}
          </Text>
        </View>
      </View>

      {profile.address ? (
        <Text style={styles.address} numberOfLines={2}>
          {profile.address}
        </Text>
      ) : null}

      {statusLabel ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusStrong}>{statusLabel}</Text>
          {statusSubtext ? (
            <Text style={styles.statusSub}>{statusSubtext}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: -RESTAURANT_INFO_OVERLAP,
    backgroundColor: RP.bg,
    borderRadius: RP.radiusL,
    padding: 18,
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
  },
  rowTop: { flexDirection: 'row', gap: 14 },
  logoWrap: {},
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: RP.surface2,
  },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 28, fontWeight: '900', color: RP.text },
  name: {
    fontSize: RP.fontH1,
    fontWeight: '900',
    color: RP.text,
    letterSpacing: -0.6,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
    flexWrap: 'wrap',
  },
  ratingCompact: {
    fontWeight: '800',
    color: RP.text,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  newLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: RP.textSecondary,
    letterSpacing: -0.2,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badgePromo: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.25)',
  },
  badgePromoText: { fontSize: 11, fontWeight: '900', color: RP.offer },
  metrics: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
  },
  metric: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 4 },
  metricDivider: { width: 1, backgroundColor: RP.border },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: RP.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  metricVal: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '900',
    color: RP.text,
    textAlign: 'center',
  },
  address: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
    color: RP.textSecondary,
    lineHeight: 20,
  },
  statusBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
  },
  statusStrong: { fontSize: 15, fontWeight: '900', color: RP.text },
  statusSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: RP.textSecondary,
  },
});
