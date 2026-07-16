import type { LiveDeliveryMapProps } from '@/components/logistics/liveDeliveryMapTypes';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function LiveDeliveryMapInner({ dark = true }: LiveDeliveryMapProps) {
  return (
    <View style={[styles.fallback, dark && styles.fallbackDark]}>
      <Text style={styles.fallbackText}>
        Live delivery map runs on iOS and Android. Use the route cards in this build for web.
      </Text>
    </View>
  );
}

export const LiveDeliveryMap = memo(LiveDeliveryMapInner);

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#09090B',
  },
  fallbackDark: { backgroundColor: '#020617' },
  fallbackText: {
    color: 'rgba(226,232,240,0.75)',
    fontWeight: '600',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
});

export type { MapCoord, LiveDeliveryMapProps } from './liveDeliveryMapTypes';
