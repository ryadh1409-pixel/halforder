import { RP } from '@/constants/restaurantPremiumTheme';
import { RESTAURANT_INFO_OVERLAP } from '@/constants/restaurantLayout';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  profile: RestaurantProfile;
  deliveryFee: number;
  serviceFee: number;
  distanceLabel: string;
  etaRange: string;
  reorderCopy: string;
};

export function RestaurantInfo({
  profile,
  deliveryFee,
  serviceFee,
  distanceLabel,
  etaRange,
  reorderCopy,
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
            <Text style={styles.star}>★</Text>
            <Text style={styles.ratingVal}>{profile.rating.toFixed(1)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.reviews}>{profile.reviewCount.toLocaleString()} reviews</Text>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.badgeGold}>
              <Text style={styles.badgeGoldText}>HalfOrder+</Text>
            </View>
            <View style={styles.badgeGreen}>
              <Text style={styles.badgeGreenText}>Top rated</Text>
            </View>
            <View style={styles.badgeRed}>
              <Text style={styles.badgeRedText}>BOGO</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Delivery</Text>
          <Text style={styles.metricVal}>
            {deliveryFee <= 0 ? '$0' : `$${deliveryFee.toFixed(2)}`}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Service</Text>
          <Text style={styles.metricVal}>${serviceFee.toFixed(2)}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Distance</Text>
          <Text style={styles.metricVal}>{distanceLabel}</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>ETA</Text>
          <Text style={styles.metricVal}>{etaRange}</Text>
        </View>
      </View>

      {profile.address ? (
        <Text style={styles.address} numberOfLines={2}>
          {profile.address}
        </Text>
      ) : null}

      <View style={styles.socialProof}>
        <Text style={styles.socialStrong}>{reorderCopy}</Text>
        <Text style={styles.socialSub}>Most liked items in your area</Text>
      </View>
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
  name: { fontSize: RP.fontH1, fontWeight: '900', color: RP.text, letterSpacing: -0.6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  star: { color: RP.gold, fontSize: 15 },
  ratingVal: { fontWeight: '800', color: RP.text, fontSize: 15 },
  dot: { color: RP.textMuted, fontWeight: '700' },
  reviews: { color: RP.textSecondary, fontWeight: '600', fontSize: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badgeGold: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(201,162,39,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  badgeGoldText: { fontSize: 11, fontWeight: '900', color: RP.gold },
  badgeGreen: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,200,83,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,83,0.25)',
  },
  badgeGreenText: { fontSize: 11, fontWeight: '900', color: RP.accent },
  badgeRed: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.25)',
  },
  badgeRedText: { fontSize: 11, fontWeight: '900', color: RP.offer },
  metrics: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, backgroundColor: RP.border },
  metricLabel: { fontSize: 11, fontWeight: '700', color: RP.textMuted, textTransform: 'uppercase' },
  metricVal: { marginTop: 4, fontSize: 15, fontWeight: '900', color: RP.text },
  address: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
    color: RP.textSecondary,
    lineHeight: 20,
  },
  socialProof: {
    marginTop: 16,
    padding: 12,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
  },
  socialStrong: { fontSize: 15, fontWeight: '900', color: RP.text },
  socialSub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: RP.textSecondary },
});
