import { RP } from '@/constants/restaurantPremiumTheme';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

function ShimmerBox({ style }: { style: object }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [t]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.35 + t.value * 0.45,
  }));
  return <Animated.View style={[styles.box, style, anim]} />;
}

export function MenuGridSkeleton({ rows = 4 }: { rows?: number }) {
  const cells = Array.from({ length: rows * 2 });
  return (
    <View style={styles.wrap}>
      {cells.map((_, i) => (
        <View key={i} style={styles.cell}>
          <ShimmerBox style={styles.img} />
          <ShimmerBox style={styles.lineLg} />
          <ShimmerBox style={styles.lineSm} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  cell: { width: '48%', marginBottom: 4 },
  box: { backgroundColor: RP.surface2, borderRadius: 12 },
  img: { width: '100%', height: 130, borderRadius: 18 },
  lineLg: { marginTop: 12, height: 16, width: '88%', borderRadius: 8 },
  lineSm: { marginTop: 8, height: 12, width: '55%', borderRadius: 6 },
});
