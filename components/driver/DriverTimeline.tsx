import {
  DRIVER_TIMELINE_STATUSES,
  formatOrderStatus,
} from './driverOrderUtils';
import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { status: OrderStatus };

export function DriverTimeline({ status }: Props) {
  const activeIdx = Math.max(
    DRIVER_TIMELINE_STATUSES.findIndex((item) => item === status),
    0,
  );

  return (
    <View style={styles.container}>
      {DRIVER_TIMELINE_STATUSES.map((step, idx) => {
        const completed = idx < activeIdx;
        const active = idx === activeIdx;
        return (
          <View key={step} style={styles.stepRow}>
            <View style={styles.leftCol}>
              <View
                style={[
                  styles.dot,
                  completed && styles.dotCompleted,
                  active && styles.dotActive,
                ]}
              />
              {idx < DRIVER_TIMELINE_STATUSES.length - 1 ? (
                <View
                  style={[styles.line, idx < activeIdx && styles.lineCompleted]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                completed && styles.labelCompleted,
                active && styles.labelActive,
              ]}
            >
              {formatOrderStatus(step)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 14, gap: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  leftCol: { alignItems: 'center', width: 18 },
  dot: {
    marginTop: 2,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  dotCompleted: { backgroundColor: '#16A34A' },
  dotActive: { backgroundColor: '#2563EB' },
  line: { width: 2, height: 18, backgroundColor: '#E2E8F0' },
  lineCompleted: { backgroundColor: '#16A34A' },
  label: { marginLeft: 8, marginBottom: 8, color: '#94A3B8', fontWeight: '600' },
  labelCompleted: { color: '#166534' },
  labelActive: { color: '#1E3A8A', fontWeight: '800' },
});
