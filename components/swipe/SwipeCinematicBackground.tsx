import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/** Clean dark backdrop — matches Emo AI (no decorative blobs). */
function SwipeCinematicBackgroundInner() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#0B0816', '#151126', '#0B0816']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export const SwipeCinematicBackground = memo(SwipeCinematicBackgroundInner);
