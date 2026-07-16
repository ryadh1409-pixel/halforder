import React from 'react';
import { StyleSheet, View } from 'react-native';

export function DeliveryProgressBar({ progress }: { progress: number }) {
  const widthPct = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: widthPct as `${number}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
});
