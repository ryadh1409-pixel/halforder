import { CK } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { DeliveryEligibilityResult } from '@/types/deliveryEligibility';

type Props = {
  eligibility: DeliveryEligibilityResult;
  loading?: boolean;
};

/** Uber Eats–style delivery zone status on checkout. */
export function DeliveryEligibilityBanner({ eligibility, loading }: Props) {
  if (loading) {
    return (
      <View style={[styles.card, styles.cardNeutral]}>
        <ActivityIndicator size="small" color={CK.textMuted} />
        <Text style={styles.loadingText}>Checking delivery distance…</Text>
      </View>
    );
  }

  const blocked = eligibility.blocked;
  const iconName = blocked ? 'location-outline' : 'checkmark-circle';
  const iconColor = blocked ? '#B45309' : '#16A34A';

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
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  cardWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cardNeutral: {
    backgroundColor: CK.surface,
    borderColor: CK.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: CK.text },
  sub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: CK.textSecondary },
  warn: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#B45309' },
  warnStrong: { color: '#92400E' },
  loadingText: { marginLeft: 8, fontSize: 13, fontWeight: '600', color: CK.textMuted },
});
