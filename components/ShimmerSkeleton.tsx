import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  /** `light` for marketplace home; `dark` for swipe/dark surfaces */
  tone?: 'light' | 'dark';
};

export function ShimmerSkeleton({
  width,
  height,
  borderRadius = 10,
  style,
  tone = 'dark',
}: Props) {
  const baseColor = tone === 'light' ? '#EBEBEB' : '#1D2430';
  const shimmerColors =
    tone === 'light'
      ? (['rgba(255,255,255,0)', '#B7BDC9', 'rgba(255,255,255,0)'] as const)
      : ([
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.18)',
          'rgba(255,255,255,0)',
        ] as const);
  const translate = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [translate]);

  const shimmerX = translate.interpolate({
    inputRange: [-1, 1],
    outputRange: [-220, 220],
  });

  return (
    <View
      style={[
        styles.base,
        { width: width as import('react-native').DimensionValue, height, borderRadius, backgroundColor: baseColor },
        style,
      ]}
    >
      <Animated.View
        style={[styles.shimmerWrap, { transform: [{ translateX: shimmerX }] }]}
      >
        <LinearGradient
          colors={shimmerColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmer}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  shimmerWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  shimmer: {
    width: 120,
    height: '100%',
  },
});
