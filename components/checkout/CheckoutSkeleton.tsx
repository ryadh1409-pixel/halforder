import { CK } from '@/constants/checkoutUi';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

function ShimmerBlock({ height, radius = 16 }: { height: number; radius?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
  }, [t]);
  const s = useAnimatedStyle(() => ({
    opacity: 0.42 + t.value * 0.35,
  }));
  return <Animated.View style={[{ height, borderRadius: radius }, styles.shim, s]} />;
}

/** Placeholder shimmer while Firebase menu / Stripe gates resolve. */
export function CheckoutSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      <ShimmerBlock height={36} radius={999} />
      <ShimmerBlock height={218} radius={CK.mapRadius} />
      {[0, 1, 2].map((i) => (
        <ShimmerBlock key={i} height={74} radius={16} />
      ))}
      <View style={{ height: 20 }} />
      <ShimmerBlock height={120} radius={CK.mapRadius} />
      <ShimmerBlock height={180} radius={CK.mapRadius} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  shim: {
    backgroundColor: CK.surface2,
    overflow: 'hidden',
  },
});
