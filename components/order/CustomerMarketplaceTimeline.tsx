import {
  CUSTOMER_MARKETPLACE_TIMELINE,
  customerMarketplaceTimelineIndex,
} from '@/lib/customerMarketplaceTimeline';
import { isCustomerOrderDelivered } from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function CustomerMarketplaceTimeline({
  order,
  variant = 'dark',
}: {
  order: OrderStageInput;
  variant?: 'light' | 'dark';
}) {
  const activeIdx = customerMarketplaceTimelineIndex(order);
  const delivered = isCustomerOrderDelivered(order);
  const isDark = variant === 'dark';
  const cancelled = activeIdx < 0;

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Delivery progress</Text>
      {cancelled ? (
        <Text style={[styles.cancelled, isDark && styles.cancelledDark]}>Order cancelled</Text>
      ) : (
        CUSTOMER_MARKETPLACE_TIMELINE.map((step, idx) => {
          const done = delivered || idx <= activeIdx;
          const active = !delivered && idx === activeIdx;
          return (
            <View key={step.key} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  isDark && styles.dotDark,
                  done && styles.dotOn,
                  active && styles.dotActive,
                ]}
              >
                {done ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <View style={styles.labelCol}>
                <Text
                  style={[
                    styles.label,
                    isDark && styles.labelDark,
                    done && styles.labelOn,
                    done && isDark && styles.labelOnDark,
                    active && styles.labelActive,
                  ]}
                >
                  {step.label}
                </Text>
                {active ? (
                  <Text style={[styles.now, isDark && styles.nowDark]}>Current step</Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    marginHorizontal: 16,
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
  cancelled: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  cancelledDark: { color: '#FCA5A5' },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    marginRight: 12,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', lineHeight: 10 },
  dotDark: { backgroundColor: 'rgba(148,163,184,0.35)' },
  dotOn: { backgroundColor: '#22C55E' },
  dotActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
    borderWidth: 2,
    borderColor: '#34D399',
  },
  labelCol: { flex: 1 },
  label: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  labelDark: { color: 'rgba(148,163,184,0.95)' },
  labelOn: { color: '#0F172A', fontWeight: '800' },
  labelOnDark: { color: '#F8FAFC' },
  labelActive: { color: '#34D399' },
  now: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#16A34A' },
  nowDark: { color: '#6EE7B7' },
});
