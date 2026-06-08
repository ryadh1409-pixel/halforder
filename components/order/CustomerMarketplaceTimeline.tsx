import {
  buildCustomerTimelineRenderSteps,
  type CustomerTimelineRenderStep,
} from '@/lib/customerMarketplaceTimeline';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function logTimelineRender(
  timelineSteps: CustomerTimelineRenderStep[],
  context: {
    currentStep: ReturnType<typeof resolveCustomerTrackStep>;
    deliveryStatus: unknown;
    status: unknown;
  },
): void {
  for (const step of timelineSteps) {
    console.log('[TIMELINE ROW]', step.id, {
      completed: step.completed,
      current: step.current,
      currentStep: context.currentStep,
      deliveryStatus: context.deliveryStatus,
      status: context.status,
    });
  }
  console.log(
    '[FINAL TIMELINE RENDER]',
    timelineSteps.map((s) => ({
      id: s.id,
      completed: s.completed,
      current: s.current,
    })),
  );
}

export function CustomerMarketplaceTimeline({
  order,
  variant = 'dark',
}: {
  order: OrderStageInput;
  variant?: 'light' | 'dark';
}) {
  const currentStep = useMemo(() => resolveCustomerTrackStep(order), [
    order.status,
    order.deliveryStatus,
    order.paymentStatus,
    order.driverId,
    order.assignedDriverId,
    order.pickedUpAtMs,
    order.deliveredAtMs,
    order.completedAtMs,
    order.cancelledAtMs,
  ]);

  const timelineSteps = useMemo(
    () => buildCustomerTimelineRenderSteps(order),
    [
      order.status,
      order.deliveryStatus,
      order.paymentStatus,
      order.driverId,
      order.assignedDriverId,
      order.pickedUpAtMs,
      order.deliveredAtMs,
      order.completedAtMs,
      order.cancelledAtMs,
      currentStep,
    ],
  );

  const isDark = variant === 'dark';
  const cancelled = currentStep === 'cancelled';

  if (__DEV__) {
    logTimelineRender(timelineSteps, {
      currentStep,
      deliveryStatus: order.deliveryStatus ?? null,
      status: order.status ?? null,
    });
  }

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>Delivery progress</Text>
      {cancelled ? (
        <Text style={[styles.cancelled, isDark && styles.cancelledDark]}>Order cancelled</Text>
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
  labelOnDark: { color: '#F8FAFC', fontWeight: '800' },
  labelActive: { color: '#34D399' },
  now: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#16A34A' },
  nowDark: { color: '#6EE7B7' },
});
