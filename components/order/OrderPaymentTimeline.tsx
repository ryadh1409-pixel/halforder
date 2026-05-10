import { PAYMENT_TIMELINE_STEPS } from '@/constants/paymentFlow';
import type { RestaurantOrder } from '@/services/orderService';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function paymentTimelineStepIndex(order: RestaurantOrder): number {
  if (order.paymentStatus === 'paid') return 2;
  if (order.paymentStatus === 'processing' || order.status === 'payment_processing') return 1;
  if (order.paymentStatus === 'failed' || order.status === 'payment_failed') return -1;
  return 0;
}

export function OrderPaymentTimeline({
  order,
  variant = 'light',
}: {
  order: RestaurantOrder;
  variant?: 'light' | 'dark';
}) {
  const activeIdx = useMemo(() => paymentTimelineStepIndex(order), [order]);
  const dark = variant === 'dark';

  if (activeIdx < 0) {
    return (
      <View style={[styles.card, dark && styles.cardDark]}>
        <Text style={[styles.title, dark && styles.titleDark]}>Payment</Text>
        <View style={[styles.failBanner, dark && styles.failBannerDark]}>
          <Text style={[styles.failTitle, dark && styles.failTitleDark]}>Payment did not go through</Text>
          <Text style={[styles.failSub, dark && styles.failSubDark]}>
            Try again from checkout or use another card.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, dark && styles.cardDark]}>
      <Text style={[styles.title, dark && styles.titleDark]}>Payment</Text>
      {PAYMENT_TIMELINE_STEPS.map((step, idx) => {
        const done = idx <= activeIdx;
        const current = idx === activeIdx;
        return (
          <View key={step.id} style={styles.row}>
            <View style={[styles.dot, dark && styles.dotDark, done && styles.dotOn, current && styles.dotCurrent]} />
            <Text style={[styles.label, dark && styles.labelDark, done && styles.labelOn, done && dark && styles.labelOnDark]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  cardDark: {
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  titleDark: { color: '#F8FAFC' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1', marginRight: 12 },
  dotDark: { backgroundColor: 'rgba(148,163,184,0.35)' },
  dotOn: { backgroundColor: '#22C55E' },
  dotCurrent: { borderWidth: 2, borderColor: '#15803D' },
  label: { color: '#64748B', fontWeight: '600', flex: 1 },
  labelDark: { color: 'rgba(148,163,184,0.95)' },
  labelOn: { color: '#0F172A', fontWeight: '800' },
  labelOnDark: { color: '#F8FAFC' },
  failBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  failTitle: { color: '#991B1B', fontWeight: '800', fontSize: 15 },
  failSub: { color: '#B91C1C', fontWeight: '600', marginTop: 6, fontSize: 13 },
  failBannerDark: {
    backgroundColor: 'rgba(127,29,29,0.35)',
    borderColor: 'rgba(248,113,113,0.45)',
  },
  failTitleDark: { color: '#FECACA' },
  failSubDark: { color: '#FCA5A5' },
});
