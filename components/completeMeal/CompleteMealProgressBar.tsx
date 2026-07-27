import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  progressRatio: number;
  paidLabel: string;
  remainingLabel: string;
};

function CompleteMealProgressBarInner({
  progressRatio,
  paidLabel,
  remainingLabel,
}: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(progressRatio * 100)));
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.paid}>{paidLabel} paid</Text>
        <Text style={styles.remain}>{remainingLabel} remaining</Text>
      </View>
    </View>
  );
}

export const CompleteMealProgressBar = memo(CompleteMealProgressBarInner);

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  track: {
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.25)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: CK.accent ?? '#A855F7',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  paid: { fontSize: 13, fontWeight: '800', color: CK.text },
  remain: { fontSize: 13, fontWeight: '700', color: CK.textSecondary },
});
