import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/** Dark blurred cinematic backdrop for the Swipe tab. */
function SwipeCinematicBackgroundInner() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#09090B', '#111217', '#111217', '#09090B']}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
    </View>
  );
}

export const SwipeCinematicBackground = memo(SwipeCinematicBackgroundInner);

const styles = StyleSheet.create({
  glowTop: {
    position: 'absolute',
    top: -80,
    left: '20%',
    width: '60%',
    height: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 107, 53, 0.14)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: 40,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
});
