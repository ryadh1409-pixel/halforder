import { PromotionBadgesRow } from '@/components/PromotionBadge';
import { RP } from '@/constants/restaurantPremiumTheme';
import { RESTAURANT_INFO_OVERLAP } from '@/constants/restaurantLayout';
import { isAdminPromotionBadgeLabel } from '@/lib/promotionBadge';
import {
  formatRatingCompact,
  type RatingDisplay,
} from '@/lib/restaurantStoreMetrics';
import { Ionicons } from '@expo/vector-icons';
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
  promoLabels?: string[];
};

const GOLD = '#F59E0B';
const GOLD_BG = 'rgba(245,158,11,0.10)';
const GOLD_BORDER = 'rgba(245,158,11,0.22)';

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({
  icon,
  label,
  value,
  free,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  free?: boolean;
}) {
  return (
    <View style={[styles.stat, free && styles.statFree]}>
      <Ionicons
        name={icon}
        size={16}
        color={free ? GOLD : RP.textMuted}
        style={styles.statIcon}
      />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statVal, free && styles.statValFree]}>
        {value}
      </Text>
      {free && <View style={styles.statFreeDot} />}
    </View>
  );
}

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
  promoLabels,
}: Props) {
  const labels =
    promoLabels && promoLabels.length > 0
      ? promoLabels
      : promoLabel
        ? [promoLabel]
        : [];
  const adminLabels = labels.filter((l) => isAdminPromotionBadgeLabel(l));
  const legacyLabels = labels.filter((l) => !isAdminPromotionBadgeLabel(l));

  const isFreeDelivery =
    deliveryFeeLabel.toLowerCase().includes('free') ||
    deliveryFeeLabel === 'CA$0.00';
  const isFreeService =
    serviceFeeLabel === 'FREE' ||
    serviceFeeLabel === 'CA$0.00' ||
    serviceFeeLabel.toLowerCase().includes('free');

  return (
    <View style={styles.card}>
      {/* ── Header row ────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        {/* Logo */}
        <View style={styles.logoShadow}>
          {profile.image ? (
            <Image source={{ uri: profile.image }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoFallback]}>
              <Text style={styles.logoLetter}>{profile.name.charAt(0)}</Text>
            </View>
          )}
        </View>

        {/* Name + rating */}
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.name}
          </Text>

          {ratingDisplay.kind === 'rated' ? (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={11} color="#FBBF24" />
              <Text style={styles.ratingTxt}>
                {formatRatingCompact(
                  ratingDisplay.rating,
                  ratingDisplay.reviewCount,
                )}
              </Text>
            </View>
          ) : (
            <View style={styles.newChip}>
              <Text style={styles.newTxt}>✨ New</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Promo badges ──────────────────────────────────────────────── */}
      {(adminLabels.length > 0 || legacyLabels.length > 0) && (
        <View style={styles.badgeRow}>
          {adminLabels.length > 0 && (
            <PromotionBadgesRow values={adminLabels} />
          )}
          {legacyLabels.map((label) => (
            <View key={label} style={styles.legacyBadge}>
              <Text style={styles.legacyBadgeTxt}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Stats row ─────────────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <StatChip
          icon="bicycle-outline"
          label="Delivery"
          value={deliveryFeeLabel}
          free={isFreeDelivery}
        />
        <View style={styles.statDivider} />
        <StatChip
          icon="receipt-outline"
          label="Service"
          value={isFreeService ? 'FREE' : serviceFeeLabel}
          free={isFreeService}
        />
        {distanceLabel != null && (
          <>
            <View style={styles.statDivider} />
            <StatChip
              icon="navigate-outline"
              label="Distance"
              value={distanceLabel}
            />
          </>
        )}
        <View style={styles.statDivider} />
        <StatChip icon="time-outline" label="ETA" value={etaLabel} />
      </View>

      {/* ── Address ───────────────────────────────────────────────────── */}
      {profile.address ? (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={13} color={RP.textMuted} />
          <Text style={styles.addressTxt} numberOfLines={2}>
            {profile.address}
          </Text>
        </View>
      ) : null}

      {/* ── Status card ───────────────────────────────────────────────── */}
      {statusLabel ? (
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusStrong}>{statusLabel}</Text>
            {statusSubtext ? (
              <Text style={styles.statusSub}>{statusSubtext}</Text>
            ) : null}
          </View>
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
    padding: 20,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
  },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderRadius: 20,
  },
  logo: { width: 76, height: 76, borderRadius: 20 },
  logoFallback: {
    backgroundColor: RP.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: { fontSize: 30, fontWeight: '900', color: RP.text },
  nameBlock: { flex: 1, gap: 8 },
  name: {
    fontSize: 26,
    fontWeight: '900',
    color: RP.text,
    letterSpacing: -0.7,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  ratingTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  newChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
  },
  newTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#A78BFA',
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  legacyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(229,57,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.2)',
  },
  legacyBadgeTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: RP.offer,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
    gap: 0,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 4,
    position: 'relative',
  },
  statFree: {
    backgroundColor: GOLD_BG,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
  },
  statIcon: { marginBottom: 0 },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: RP.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  statVal: {
    fontSize: 11,
    fontWeight: '900',
    color: RP.text,
    textAlign: 'center',
    lineHeight: 14,
  },
  statValFree: { color: GOLD },
  statFreeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  statDivider: {
    width: 1,
    backgroundColor: RP.border,
    marginTop: 6,
    marginBottom: 6,
    marginHorizontal: 3,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 14,
  },
  addressTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: RP.textSecondary,
    lineHeight: 18,
  },

  // Status
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RP.border,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
    marginTop: 5,
  },
  statusStrong: {
    fontSize: 14,
    fontWeight: '900',
    color: RP.text,
    lineHeight: 20,
  },
  statusSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: RP.textSecondary,
    lineHeight: 17,
  },
});
