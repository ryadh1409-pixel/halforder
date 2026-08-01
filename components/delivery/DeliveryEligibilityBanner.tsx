import { CK } from '@/constants/checkoutUi';
import {
  LOCATION_UNAVAILABLE_MESSAGE,
  RESTAURANT_LOCATION_UNAVAILABLE_MESSAGE,
} from '@/lib/delivery/deliveryEligibility';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { DeliveryEligibilityResult } from '@/types/deliveryEligibility';

type Props = {
  eligibility: DeliveryEligibilityResult;
  loading?: boolean;
  /** Checkout-only lighter layout. Default preserves existing screens. */
  variant?: 'default' | 'checkout';
};

/** Uber Eats–style delivery zone status on checkout. */
export function DeliveryEligibilityBanner({
  eligibility,
  loading,
  variant = 'default',
}: Props) {
  const isCheckout = variant === 'checkout';

  if (loading) {
    return (
      <View
        style={[
          isCheckout ? styles.checkoutRow : styles.card,
          isCheckout ? styles.checkoutNeutral : styles.cardNeutral,
        ]}
      >
        <ActivityIndicator size="small" color={CK.textMuted} />
        <Text style={styles.loadingText}>Checking delivery distance…</Text>
      </View>
    );
  }

  const restaurantUnavailable =
    eligibility.statusLabel === RESTAURANT_LOCATION_UNAVAILABLE_MESSAGE ||
    eligibility.message === RESTAURANT_LOCATION_UNAVAILABLE_MESSAGE;

  const customerUnavailable =
    eligibility.statusLabel === 'Location unavailable' ||
    eligibility.etaLabel === 'Location unavailable' ||
    eligibility.message === LOCATION_UNAVAILABLE_MESSAGE;

  if (restaurantUnavailable) {
    return (
      <View
        style={[
          isCheckout ? styles.checkoutRow : styles.card,
          isCheckout ? styles.checkoutWarn : styles.cardWarn,
        ]}
      >
        <Ionicons name="storefront-outline" size={20} color="#B45309" />
        <View style={styles.copy}>
          <Text style={isCheckout ? styles.checkoutEta : styles.title}>
            Restaurant location unavailable
          </Text>
          <Text style={isCheckout ? styles.checkoutSecondary : styles.sub}>
            {eligibility.message ??
              'This restaurant has not set a delivery address with GPS yet.'}
          </Text>
        </View>
      </View>
    );
  }

  if (customerUnavailable) {
    return (
      <View
        style={[
          isCheckout ? styles.checkoutRow : styles.card,
          isCheckout ? styles.checkoutWarn : styles.cardWarn,
        ]}
      >
        <Ionicons name="location-outline" size={20} color="#B45309" />
        <View style={styles.copy}>
          <Text style={isCheckout ? styles.checkoutEta : styles.title}>
            Location unavailable
          </Text>
          <Text style={isCheckout ? styles.checkoutSecondary : styles.sub}>
            {eligibility.message ??
              'Enable location access to see delivery distance and ETA.'}
          </Text>
        </View>
      </View>
    );
  }

  const blocked = eligibility.blocked;
  const iconName = blocked ? 'location-outline' : 'checkmark-circle';
  const iconColor = blocked ? '#B45309' : '#A855F7';

  if (isCheckout) {
    return (
      <View
        style={[
          styles.checkoutRow,
          blocked ? styles.checkoutWarn : styles.checkoutOk,
        ]}
      >
        <Ionicons name={iconName} size={18} color={iconColor} />
        <View style={styles.copy}>
          <Text style={styles.checkoutEta}>{eligibility.etaLabel}</Text>
          {eligibility.distanceLabel ? (
            <Text style={styles.checkoutSecondary}>
              {eligibility.distanceLabel} away
            </Text>
          ) : null}
          {eligibility.deliverable && eligibility.deliveryFee.label ? (
            <Text style={styles.checkoutFee}>
              {eligibility.deliveryFee.label} delivery
            </Text>
          ) : null}
          {eligibility.message ? (
            <Text style={[styles.warn, blocked && styles.warnStrong]}>
              {eligibility.message}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, blocked ? styles.cardWarn : styles.cardOk]}>
      <Ionicons name={iconName} size={20} color={iconColor} />
      <View style={styles.copy}>
        <Text style={styles.title}>
          {eligibility.distanceLabel
            ? `${eligibility.distanceLabel} away`
            : 'Delivery distance'}
        </Text>
        <Text style={styles.sub}>
          {eligibility.etaLabel}
          {eligibility.deliverable && eligibility.deliveryFee.label
            ? ` · ${eligibility.deliveryFee.label} delivery`
            : ''}
        </Text>
        {eligibility.message ? (
          <Text style={[styles.warn, blocked && styles.warnStrong]}>
            {eligibility.message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardOk: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderColor: '#22C55E',
  },
  cardWarn: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderColor: '#F59E0B',
  },
  cardNeutral: {
    backgroundColor: CK.surface,
    borderColor: CK.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutRow: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkoutOk: {
    backgroundColor: 'transparent',
  },
  checkoutWarn: {
    backgroundColor: 'transparent',
  },
  checkoutNeutral: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: CK.text },
  sub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textSecondary,
  },
  checkoutEta: {
    fontSize: 17,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.3,
  },
  checkoutSecondary: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textSecondary,
  },
  checkoutFee: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: CK.textMuted,
  },
  warn: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#B45309' },
  warnStrong: { color: '#92400E' },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textMuted,
  },
});
