import { RP } from '@/constants/restaurantPremiumTheme';
import { RESTAURANT_INFO_OVERLAP } from '@/constants/restaurantLayout';
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

/** Hero + carousel placeholders while Firebase streams load. */
export function RestaurantAboveFoldSkeleton() {
  return (
    <View style={styles.aboveFold}>
      <ShimmerBox style={styles.heroPh} />
      <View style={styles.infoMock}>
        <ShimmerBox style={styles.logoPh} />
        <View style={styles.linesCol}>
          <ShimmerBox style={styles.lineTitle} />
          <ShimmerBox style={styles.lineSub} />
        </View>
      </View>
      <View style={styles.carouselRow}>
        {[0, 1, 2].map((i) => (
          <ShimmerBox key={i} style={styles.carouselCard} />
        ))}
      </View>
    </View>
  );
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
  aboveFold: {},
  heroPh: { width: '100%', height: 288 },
  infoMock: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 16,
    marginTop: -RESTAURANT_INFO_OVERLAP,
    marginBottom: 12,
    padding: 18,
    borderRadius: 24,
    backgroundColor: RP.bg,
    borderWidth: 1,
    borderColor: RP.border,
    alignItems: 'center',
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    zIndex: 2,
  },
  logoPh: { width: 72, height: 72, borderRadius: 18 },
  linesCol: { flex: 1, gap: 10 },
  lineTitle: { height: 24, borderRadius: 8, width: '78%' },
  lineSub: { height: 16, borderRadius: 8, width: '45%' },
  carouselRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginTop: 16, marginBottom: 4 },
  carouselCard: { width: 168, height: 220, borderRadius: 18 },
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
