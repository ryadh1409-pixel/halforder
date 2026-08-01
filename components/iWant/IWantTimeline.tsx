import {
  buildIWantTimelineRenderSteps,
  resolveIWantTimelineStep,
} from '@/lib/iWantTimeline';
import type { OrderStageInput } from '@/services/orderStage';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function IWantTimeline({
  order,
  variant = 'dark',
}: {
  order: OrderStageInput;
  variant?: 'light' | 'dark';
}) {
  const active = useMemo(() => resolveIWantTimelineStep(order), [
    order.status,
    order.deliveryStatus,
    order.driverId,
    order.assignedDriverId,
    order.pickedUpAtMs,
    order.deliveredAtMs,
    order.completedAtMs,
    order.cancelledAtMs,
  ]);

  const timelineSteps = useMemo(
    () => buildIWantTimelineRenderSteps(order),
    [
      order.status,
      order.deliveryStatus,
      order.driverId,
      order.assignedDriverId,
      order.pickedUpAtMs,
      order.deliveredAtMs,
      order.completedAtMs,
      order.cancelledAtMs,
      active,
    ],
  );

  const isDark = variant === 'dark';
  const cancelled = active === 'cancelled';
  const waiting = active === 'waiting';

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Delivery progress</Text>
      {waiting && !cancelled ? (
        <Text style={[styles.waiting, isDark && styles.waitingDark]}>
          Waiting for a driver to accept your order
        </Text>
      ) : null}
      {cancelled ? (
        <Text style={[styles.cancelled, isDark && styles.cancelledDark]}>
          Order cancelled
        </Text>
      ) : (
        timelineSteps.map((step) => (
          <View key={step.id} style={styles.row}>
            <View
              style={[
                styles.dot,
                isDark && styles.dotDark,
                step.completed && styles.dotOn,
                step.current && styles.dotActive,
              ]}
            >
              {step.completed ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <View style={styles.labelCol}>
              <Text
                style={[
                  styles.label,
                  isDark && styles.labelDark,
                  step.completed && (isDark ? styles.labelOnDark : styles.labelOn),
                  step.current && styles.labelActive,
                ]}
              >
                {step.label}
              </Text>
              {step.current ? (
                <Text style={[styles.now, isDark && styles.nowDark]}>Current step</Text>
              ) : null}
            </View>
          </View>
        ))
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
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0B0816',
    padding: 16,
  },
  cardDark: {
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0E1218',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  titleDark: { color: '#FFFFFF' },
  waiting: {
    color: '#A855F7',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 12,
  },
  waitingDark: { color: '#C084FC' },
  cancelled: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  cancelledDark: { color: '#EF4444' },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#7D8493',
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
    borderColor: '#22C55E',
  },
  labelCol: { flex: 1 },
  label: { color: '#7D8493', fontWeight: '600', fontSize: 14 },
  labelDark: { color: '#7D8493' },
  labelOn: { color: '#FFFFFF', fontWeight: '800' },
  labelOnDark: { color: '#FFFFFF', fontWeight: '800' },
  labelActive: { color: '#22C55E' },
  now: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#22C55E' },
  nowDark: { color: '#6EE7B7' },
});
